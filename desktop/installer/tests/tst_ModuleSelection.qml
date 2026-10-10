import QtQuick
import QtQuick.Controls
import QtTest
import "../ui"

Item {
    id: fixture
    width: 1040
    height: 680
    visible: true

    ModuleSelection { id: selection; reducedMotion: true }

    TestCase {
        name: "ModuleSelection"
        when: windowShown

        function init() {
            selection.selectedModuleIds = []
            selection.open()
            tryCompare(selection, "opened", true)
            if (selection.visible)
                waitForRendering(selection.contentItem)
        }
        function cleanup() {
            selection.close()
            tryCompare(selection, "visible", false)
            fixture.Window.window.width = 1040
            fixture.Window.window.height = 680
        }
        function control(name) {
            const item = findChild(selection.contentItem, name)
            verify(item !== null, name)
            return item
        }
        function click(name) {
            const item = control(name)
            mouseClick(item, item.width / 2, item.height / 2)
            if (selection.visible)
                waitForRendering(selection.contentItem)
        }
        function test_groupSelectionAndPartialState() {
            click("fluid-propulsion")
            compare(selection.selectedModuleIds.length, 3)
            for (const id of ["rocket-performance", "nozzle", "injector"])
                compare(control(id).checked, true)
            click("nozzle")
            compare(selection.selectedModuleIds.length, 2)
            compare(control("fluid-propulsion").checkState, Qt.PartiallyChecked)
            click("fluid-propulsion")
            compare(selection.selectedModuleIds.length, 3)
            compare(control("fluid-propulsion").checkState, Qt.Checked)
            click("fluid-propulsion")
            compare(selection.selectedModuleIds.length, 0)
        }
        function test_independentGroupsAndReopen() {
            click("stencil")
            compare(control("electronics").checkState, Qt.Checked)
            click("thermochemistry")
            click("fluid-propulsion")
            compare(selection.selectedModuleIds.length, 5)
            click("fluid-propulsion")
            compare(selection.selectedModuleIds.length, 2)
            click("back")
            tryCompare(selection, "visible", false)
            selection.open()
            tryCompare(selection, "opened", true)
            compare(control("stencil").checked, true)
            compare(control("chemical-equilibrium").checked, true)
            compare(control("fluid-propulsion").checkState, Qt.Unchecked)
        }
        function test_keyboardAndEscape() {
            const group = control("fluid-propulsion")
            group.forceActiveFocus()
            keyClick(Qt.Key_Space)
            tryCompare(selection, "selectedModuleIds", ["rocket-performance", "nozzle", "injector"])
            keyClick(Qt.Key_Escape)
            tryCompare(selection, "visible", false)
        }
        function test_accessibilityToggle() {
            control("fluid-propulsion").Accessible.toggleAction()
            compare(selection.selectedModuleIds.length, 3)
            control("nozzle").Accessible.pressAction()
            compare(selection.selectedModuleIds.length, 2)
            compare(control("fluid-propulsion").checkState, Qt.PartiallyChecked)
        }
        function test_smallWindowControls() {
            fixture.Window.window.width = 720
            fixture.Window.window.height = 480
            tryCompare(selection, "height", 480)
            waitForRendering(selection.contentItem)
            const injector = control("injector")
            injector.forceActiveFocus()
            keyClick(Qt.Key_Space)
            compare(selection.selectedModuleIds.length, 1)
            const back = control("back")
            const position = back.mapToItem(selection.contentItem, 0, 0)
            verify(position.y >= 0 && position.y + back.height <= selection.height)
        }
    }
}
