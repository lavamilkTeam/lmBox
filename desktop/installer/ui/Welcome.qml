import QtQuick
import QtQuick.Controls

ApplicationWindow {
    id: window
    width: 1040
    height: 680
    minimumWidth: 720
    minimumHeight: 480
    visible: true
    title: "安装 lmbox"
    color: "white"

    property bool reducedMotion: false
    property bool landed: false
    property bool started: false

    function startWelcome() {
        if (started || welcomeFont.status !== FontLoader.Ready)
            return
        started = true
        if (reducedMotion) {
            pig.offset = 0
            pig.opacity = 1
            heading.offset = 0
            heading.opacity = 1
            action.opacity = 1
            landed = true
        } else {
            pigEntrance.start()
            textEntrance.start()
            buttonEntrance.start()
        }
    }

    FontLoader {
        id: welcomeFont
        source: "qrc:/installer/assets/welcome-soft.ttf"
        onStatusChanged: if (status === FontLoader.Ready) Qt.callLater(window.startWelcome)
    }
    Component.onCompleted: Qt.callLater(startWelcome)

    Item {
        id: content
        width: Math.min(window.width - 80, 820)
        height: 310
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -12

        Item {
            id: pig
            property real offset: -window.width
            x: offset
            width: window.width < 900 ? 240 : 310
            height: width
            anchors.verticalCenter: parent.verticalCenter
            opacity: 0
            Accessible.role: Accessible.Graphic
            Accessible.name: "猪猪"

            Image {
                anchors.fill: parent
                source: "qrc:/installer/assets/pig-still.png"
                fillMode: Image.PreserveAspectFit
                visible: !movie.visible
            }
            AnimatedImage {
                id: movie
                anchors.fill: parent
                source: window.landed && !window.reducedMotion ? "qrc:/installer/assets/pig.gif" : ""
                playing: window.landed && !window.reducedMotion && !moduleSelection.visible
                visible: source.toString() !== "" && status === Image.Ready
                fillMode: Image.PreserveAspectFit
                cache: true
            }
        }

        Item {
            id: copy
            x: pig.width + (window.width < 900 ? 42 : 76)
            width: content.width - x
            height: 255
            anchors.verticalCenter: parent.verticalCenter
            anchors.verticalCenterOffset: 10

            Column {
                id: heading
                property real offset: -70
                y: offset
                spacing: 4
                opacity: 0

                Text {
                    text: "让我们开始安装"
                    font.family: welcomeFont.name
                    font.weight: Font.Medium
                    font.pixelSize: window.width < 900 ? 32 : 40
                    color: "#242424"
                    renderType: Text.NativeRendering
                }
                Text {
                    text: "lmbox"
                    font.family: welcomeFont.name
                    font.weight: Font.Medium
                    font.pixelSize: 76
                    color: "#242424"
                    renderType: Text.NativeRendering
                }
            }

            Button {
                id: action
                y: 193
                width: 146
                height: 52
                opacity: 0
                text: "继续"
                enabled: opacity > 0.99
                hoverEnabled: true
                Accessible.name: text
                onClicked: moduleSelection.open()

                background: Rectangle {
                    radius: 14
                    color: action.down ? "#171717" : action.hovered ? "#3b3b3b" : "#242424"
                    border.color: action.activeFocus ? "#ee91af" : color
                    border.width: action.activeFocus ? 3 : 0
                }
                contentItem: Item {
                    Text {
                        x: 23
                        anchors.verticalCenter: parent.verticalCenter
                        text: action.text
                        font.family: welcomeFont.name
                        font.weight: Font.Medium
                        font.pixelSize: 18
                        color: "white"
                    }
                    Item {
                        width: 18
                        height: 18
                        anchors.right: parent.right
                        anchors.rightMargin: 18
                        anchors.verticalCenter: parent.verticalCenter
                        Rectangle { width: 14; height: 1.5; x: 1; y: 8; color: "white"; radius: 1 }
                        Rectangle { width: 8; height: 1.5; x: 8; y: 5.5; rotation: 45; color: "white"; radius: 1 }
                        Rectangle { width: 8; height: 1.5; x: 8; y: 10.5; rotation: -45; color: "white"; radius: 1 }
                    }
                }
            }
        }
    }

    ModuleSelection {
        id: moduleSelection
        fontFamily: welcomeFont.name
        reducedMotion: window.reducedMotion
        onClosed: action.forceActiveFocus()
    }

    SequentialAnimation {
        id: pigEntrance
        ParallelAnimation {
            NumberAnimation { target: pig; property: "offset"; to: 18; duration: 610; easing.type: Easing.OutCubic }
            NumberAnimation { target: pig; property: "opacity"; to: 1; duration: 180 }
        }
        NumberAnimation { target: pig; property: "offset"; to: -7; duration: 160; easing.type: Easing.InOutSine }
        NumberAnimation { target: pig; property: "offset"; to: 0; duration: 150; easing.type: Easing.OutCubic }
        ScriptAction { script: window.landed = true }
    }
    SequentialAnimation {
        id: textEntrance
        PauseAnimation { duration: 140 }
        ParallelAnimation {
            NumberAnimation { target: heading; property: "offset"; to: 8; duration: 570; easing.type: Easing.OutCubic }
            NumberAnimation { target: heading; property: "opacity"; to: 1; duration: 260 }
        }
        NumberAnimation { target: heading; property: "offset"; to: 0; duration: 230; easing.type: Easing.OutCubic }
    }
    SequentialAnimation {
        id: buttonEntrance
        PauseAnimation { duration: 660 }
        NumberAnimation { target: action; property: "opacity"; to: 1; duration: 500 }
    }
}
