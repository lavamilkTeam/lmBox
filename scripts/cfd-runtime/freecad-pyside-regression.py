#!/usr/bin/env python3
"""Exercise PySide's public signals through repeated non-QObject receiver deletion."""

import gc
import json
import time

from PySide6 import QtCore, QtGui, QtWidgets


def main():
    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
    app.setQuitOnLastWindowClosed(False)
    ticks = 0
    rounds = 0
    failures = []
    deadline = time.monotonic() + 10

    class Receiver:
        def first(self):
            pass

        def second(self):
            pass

    def pulse():
        nonlocal ticks
        ticks += 1

    heartbeat = QtCore.QTimer()
    heartbeat.timeout.connect(pulse)
    heartbeat.start(10)

    def cycle():
        nonlocal rounds
        rounds += 1
        actions = [QtGui.QAction(str(index), app) for index in range(16)]
        receiver = Receiver()
        for index, action in enumerate(actions):
            action.triggered.connect(receiver.first if index % 2 else receiver.second)
            action.trigger()
        receiver = None
        gc.collect()
        if not heartbeat.isActive() or heartbeat.receivers("2timeout()") != 1:
            failures.append("Deleting an unrelated receiver disconnected the heartbeat")
        for action in actions:
            action.deleteLater()
        if rounds < 25 and time.monotonic() < deadline:
            QtCore.QTimer.singleShot(10, cycle)
        else:
            QtCore.QTimer.singleShot(50, app.quit)

    QtCore.QTimer.singleShot(25, cycle)
    app.exec()
    if rounds != 25 or ticks <= 10:
        failures.append("The repeating timer stopped receiving events")
    summary = {
        "status": "failed" if failures else "passed",
        "check": "PYSIDE-3148 unrelated timer survives receiver deletion",
        "qtVersion": QtCore.qVersion(),
        "receiverDeletionRounds": rounds,
        "timerTicks": ticks,
        "timerActive": heartbeat.isActive(),
        "timerConnections": heartbeat.receivers("2timeout()"),
        "errors": sorted(set(failures)),
    }
    heartbeat.stop()
    print(json.dumps(summary), flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
