"""FreeCAD/CfdOF loading and task-scoped external process ownership."""

import gc
import importlib
import os
import runpy
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

COMMANDS = (
    "CfdOF_Analysis",
    "CfdOF_MeshFromShape",
    "CfdOF_MeshRegion",
    "CfdOF_DynamicMeshInterfaceRefinement",
    "CfdOF_DynamicMeshShockRefinement",
    "CfdOF_GroupDynamicMeshRefinement",
    "CfdOF_PhysicsModel",
    "CfdOF_FluidMaterial",
    "CfdOF_FluidBoundary",
    "CfdOF_InitialiseInternal",
    "CfdOF_InitialisationZone",
    "CfdOF_PorousZone",
    "CfdOF_MeanVelocityForce",
    "CfdOF_ReportingFunctions",
    "CfdOF_ScalarTransportFunctions",
    "CfdOF_SolverControl",
    "CfdOF_OpenPreferences",
    "CfdOF_ReloadWorkbench",
    "CfdOF_RunTests",
    "CfdOF_UpdateTestData",
    "CfdOF_CleanTests",
)


class Runtime:
    def __init__(
        self,
        upstream,
        session,
        docker_image,
        docker_executable,
        log,
        paraview_executable=None,
        container_name=None,
    ):
        source = Path(upstream).resolve(strict=True)
        if not (source / "CfdOF/CfdTools.py").is_file():
            raise ValueError("CfdOF source directory is invalid")
        self.session = Path(session).resolve()
        self.session.mkdir(parents=True, exist_ok=True)
        self.upstream = self.session / "source"
        if not self.upstream.exists():
            shutil.copytree(
                source, self.upstream, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc")
            )
        for folder in ("profile", "output", "imports", "cache", "tmp"):
            (self.session / folder).mkdir(exist_ok=True)
        self.log = log
        self.panel = None
        self.editor_generation = 0
        self.command_objects = {}
        self.container_id = None
        self.docker_image = docker_image
        self.docker_executable = docker_executable
        self.docker_name = container_name or "lmbox-cfd-" + uuid.uuid4().hex[:12]
        self.paraview_executable = paraview_executable
        self.external_processes = []
        self._load()

    def _load(self):
        root = Path(sys.executable).resolve().parents[1]
        os.environ["QT_QPA_PLATFORM"] = "offscreen"
        plugin_path = root / "lib/qt6/plugins"
        if plugin_path.is_dir():
            os.environ["QT_PLUGIN_PATH"] = str(plugin_path)
        os.environ["FREECAD_USER_HOME"] = str(self.session / "profile")
        os.environ["XDG_CONFIG_HOME"] = str(self.session / "profile")
        os.environ["XDG_CACHE_HOME"] = str(self.session / "cache")
        os.environ["MPLCONFIGDIR"] = str(self.session / "cache/matplotlib")
        os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
        sys.dont_write_bytecode = True
        tempfile.tempdir = str(self.session / "tmp")
        for name in ("TMPDIR", "TMP", "TEMP"):
            os.environ[name] = tempfile.tempdir
        sys.path[:0] = [
            str(root / "lib"),
            str(root / "Mod/Part"),
            str(root / "Mod/Fem"),
            str(self.upstream),
        ]
        if sys.platform.startswith("linux"):
            sys.path[:0] = [
                "/usr/lib/freecad/lib",
                "/usr/lib/freecad-python3/lib",
                "/usr/share/freecad/Mod",
                "/usr/share/freecad/Mod/Part",
                "/usr/share/freecad/Mod/Fem",
            ]
        self.app = importlib.import_module("FreeCAD")
        self.blocked_flatmesh = False
        if (
            sys.platform == "darwin"
            and self.app.Version()[:3] == ["1", "1", "3"]
            and "flatmesh" not in sys.modules
        ):
            # This optional stock extension links a second libpython in the embedded
            # worker. MeshWorkbench already handles ImportError for its absence.
            sys.modules["flatmesh"] = None
            self.blocked_flatmesh = True
        for key, value in (
            ("UserAppData", str(self.session / "profile") + os.sep),
            ("UserParameterFile", str(self.session / "profile/user.cfg")),
            ("SystemParameterFile", str(self.session / "profile/system.cfg")),
        ):
            self.app.ConfigSet(key, value)
        self.qt = importlib.import_module("PySide.QtCore")
        self.qt.QCoreApplication.setAttribute(self.qt.Qt.AA_DontUseNativeDialogs, True)
        self.gui = importlib.import_module("FreeCADGui")
        self.gui.showMainWindow()
        self.gui.getMainWindow().hide()
        self.qt = importlib.import_module("PySide.QtCore")
        self.widgets = importlib.import_module("PySide.QtWidgets")
        self.qt_app = self.widgets.QApplication.instance()
        self.qt_app.setQuitOnLastWindowClosed(False)
        self._qprocess = self.qt.QProcess

        def managed_start(process, *args):
            if not isinstance(process, self._qprocess):
                args = (process, *args)
                process = self._qprocess()
            if args:
                process.setProgram(args[0])
            if len(args) > 1:
                process.setArguments(args[1])
            if len(args) > 2:
                process.setWorkingDirectory(args[2])
            if self.paraview_executable and Path(process.program()).resolve() == Path(
                self.paraview_executable
            ).resolve():
                environment = process.processEnvironment()
                if environment.isEmpty():
                    environment = self.qt.QProcessEnvironment.systemEnvironment()
                for name in ("QT_QPA_PLATFORM", "QT_PLUGIN_PATH", "QT_QPA_PLATFORM_PLUGIN_PATH"):
                    environment.remove(name)
                process.setProcessEnvironment(environment)
            process.setProcessChannelMode(self.qt.QProcess.ForwardedChannels)
            process.start()
            success = process.waitForStarted(5000)
            if success:
                self.external_processes.append(process)
            return success

        class OwnedProcess(self._qprocess):
            def startDetached(process, *args):
                return managed_start(process, *args)

        self.qt.QProcess = OwnedProcess
        self.tools = importlib.import_module("CfdOF.CfdTools")
        self.prefs = self.app.ParamGet(self.tools.getPreferencesLocation())
        self.prefs.SetString("DefaultOutputPath", str(self.session / "output"))
        self.prefs.SetBool("AppendDocNameToOutputPath", False)
        self.prefs.SetBool("UseDocker", bool(self.docker_image))
        self.prefs.SetString("DockerURL", self.docker_image or "")
        if self.paraview_executable:
            self.prefs.SetString("ParaviewPath", self.paraview_executable)

        self._add_command = self.gui.addCommand

        def register(name, command, *args):
            if name in COMMANDS:
                self.command_objects[name] = command
            return self._add_command(name, command, *args)

        self.gui.addCommand = register
        runpy.run_path(
            str(self.upstream / "InitGui.py"),
            init_globals={
                "Workbench": self.gui.Workbench,
                "FreeCAD": self.app,
                "FreeCADGui": self.gui,
            },
        )
        self.gui.activateWorkbench("CfdOFWorkbench")
        if len(self.command_objects) != len(COMMANDS):
            raise RuntimeError("CfdOF command registration differs from the supported revision")

        self._control = self.gui.Control
        self._show_dialog = self._control.showDialog
        self._close_dialog = self._control.closeDialog

        def show_dialog(panel):
            self.panel = panel
            self.editor_generation += 1
            return self._show_dialog(panel)

        def close_dialog():
            result = self._close_dialog()
            self.panel = None
            return result

        original = self._control

        class Control:
            showDialog = staticmethod(show_dialog)
            closeDialog = staticmethod(close_dialog)

            def __getattr__(self, name):
                return getattr(original, name)

        self.gui.Control = Control()
        self._preferences = self.gui.showPreferences

        def preferences(category="", *args):
            if category != "CfdOF":
                return self._preferences(category, *args)
            page_class = importlib.import_module("CfdOF.CfdPreferencePage").CfdPreferencePage
            page = page_class()
            dialog = self.widgets.QDialog()
            dialog.setWindowTitle("CfdOF preferences")
            layout = self.widgets.QVBoxLayout(dialog)
            layout.addWidget(page.form)
            box = self.widgets.QDialogButtonBox(
                self.widgets.QDialogButtonBox.Ok
                | self.widgets.QDialogButtonBox.Cancel
                | self.widgets.QDialogButtonBox.Apply
            )
            layout.addWidget(box)
            box.accepted.connect(lambda: (page.saveSettings(), dialog.accept()))
            box.rejected.connect(dialog.reject)
            box.button(self.widgets.QDialogButtonBox.Apply).clicked.connect(page.saveSettings)
            page.loadSettings()
            try:
                return dialog.exec()
            finally:
                page.cleanUp()
                dialog.deleteLater()

        self.gui.showPreferences = preferences
        self.attach_container()
        document = self.app.newDocument("CfdSession")
        self.app.setActiveDocument(document.Name)
        self.gui.setActiveDocument(document.Name)
        self.qt_app.processEvents()

    def attach_container(self):
        container = self.tools.DockerContainer()
        container.docker_cmd = self.docker_executable
        container.usedocker = bool(self.docker_image)
        container.start_container = self.start_container
        container.clean_container = self.stop_container
        container.container_id = self.container_id
        container.image_name = self.docker_image
        container.output_path_used = str(self.session / "output")
        self.tools.docker_container = container

    def activate_command(self, payload):
        name = payload.get("commandId", payload.get("id"))
        if name not in COMMANDS:
            raise ValueError("Unknown CfdOF command")
        command = self.command_objects[name]
        if not command.IsActive():
            raise ValueError("The original command is inactive for this selection")
        if hasattr(command, "GetCommands"):
            child = payload.get("childCommandId", command.GetCommands()[0])
            if child not in command.GetCommands():
                raise ValueError("Invalid grouped command")
            command = self.command_objects[child]
            if not command.IsActive():
                raise ValueError("The original grouped command is inactive for this selection")
        command.Activated()
        if name == "CfdOF_ReloadWorkbench":
            self.attach_container()

    def start_container(self):
        if self.container_id:
            return 0
        if not self.docker_image:
            raise RuntimeError("No solver image was configured by the host")
        subprocess.run(
            [self.docker_executable, "image", "inspect", self.docker_image],
            capture_output=True,
            check=True,
            timeout=15,
        )
        command = [
            self.docker_executable,
            "run",
            "--rm",
            "-d",
            "--pull",
            "never",
            "--name",
            self.docker_name,
            "--network",
            "none",
            "--cpus",
            "2",
            "--memory",
            "2g",
            "--pids-limit",
            "256",
        ]
        if hasattr(os, "getuid"):
            command += ["--user", f"{os.getuid()}:{os.getgid()}"]
        command += [
            "--mount",
            f"type=bind,source={self.session / 'output'},target=/tmp",
            "--entrypoint",
            "sleep",
            self.docker_image,
            "infinity",
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=30)
        self.container_id = result.stdout.strip()
        container = self.tools.docker_container
        container.container_id = self.container_id
        container.output_path_used = str(self.session / "output")
        return 0

    def stop_container(self):
        if self.container_id:
            subprocess.run(
                [self.docker_executable, "rm", "-f", self.container_id],
                capture_output=True,
                timeout=20,
                check=False,
            )
            self.container_id = None
            self.tools.docker_container.container_id = None
        return 0

    def forms(self):
        form = getattr(self.panel, "form", None)
        if form is None:
            return []
        return list(form) if isinstance(form, (list, tuple)) else [form]

    def finish_editor(self, method):
        if self.panel is None or not hasattr(self.panel, method):
            raise ValueError("No native editor is open")
        q = self.widgets
        desired = q.QDialogButtonBox.Ok if method == "accept" else q.QDialogButtonBox.Cancel
        boxes = self.gui.getMainWindow().findChildren(q.QDialogButtonBox)
        for box in boxes:
            button = box.button(desired)
            if button is None and method == "reject":
                button = box.button(q.QDialogButtonBox.Close)
            if button is not None and button.isEnabled():
                button.click()
                return
        raise RuntimeError("Native task editor has no matching standard button")

    def editor_actions(self):
        result = {"accept": False, "reject": False}
        for box in self.gui.getMainWindow().findChildren(self.widgets.QDialogButtonBox):
            accept = box.button(self.widgets.QDialogButtonBox.Ok)
            reject = box.button(self.widgets.QDialogButtonBox.Cancel) or box.button(
                self.widgets.QDialogButtonBox.Close
            )
            if accept:
                result.update(accept=accept.isEnabled(), acceptLabel=accept.text())
            if reject:
                result.update(reject=reject.isEnabled(), rejectLabel=reject.text())
        return result

    def staged_file(self, value):
        path = Path(value).resolve(strict=True)
        try:
            path.relative_to(self.session / "imports")
        except ValueError as error:
            raise ValueError("Import must use a host-staged file in this session") from error
        if not path.is_file() or path.stat().st_size > 256 * 1024 * 1024:
            raise ValueError("Import file is missing or exceeds 256 MiB")
        return path

    def close(self):
        try:
            for process in self.external_processes:
                if process.state() != self.qt.QProcess.NotRunning:
                    process.terminate()
                    if not process.waitForFinished(3000):
                        process.kill()
                        process.waitForFinished(1000)
            for dialog in self.widgets.QApplication.topLevelWidgets():
                if isinstance(dialog, self.widgets.QDialog):
                    dialog.reject()
            if self.panel and hasattr(self.panel, "reject"):
                self.finish_editor("reject")
            self.panel = None
            self.gui.Control = self._control
            self.gui.showPreferences = self._preferences
            self.qt.QProcess = self._qprocess
            self.gui.addCommand = self._add_command
            for name in list(self.app.listDocuments()):
                self.app.closeDocument(name)
            self.qt_app.sendPostedEvents(None, self.qt.QEvent.DeferredDelete)
            self.qt_app.processEvents()
            self.gui.getMainWindow().close()
            self.qt_app.processEvents()
            gc.collect()
        finally:
            if self.blocked_flatmesh and sys.modules.get("flatmesh") is None:
                sys.modules.pop("flatmesh", None)
            self.stop_container()
