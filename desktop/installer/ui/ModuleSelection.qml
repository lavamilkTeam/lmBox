pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls

Popup {
    id: selection
    parent: Overlay.overlay
    width: parent ? parent.width : 1040
    height: parent ? parent.height : 680
    padding: 0
    modal: true
    focus: true
    closePolicy: Popup.CloseOnEscape

    property string fontFamily: ""
    property bool reducedMotion: false
    property var selectedModuleIds: []
    readonly property var groups: [
        { id: "electronics", title: "电子电气", modules: [
            { id: "stencil", title: "钢网设计与制造" }
        ] },
        { id: "thermochemistry", title: "热化学", modules: [
            { id: "chemical-equilibrium", title: "化学平衡分析" }
        ] },
        { id: "fluid-propulsion", title: "流体与动力", modules: [
            { id: "rocket-performance", title: "火箭发动机性能分析" },
            { id: "nozzle", title: "喷管初步设计" },
            { id: "injector", title: "喷注器水力设计" }
        ] }
    ]

    function groupState(modules) {
        const count = modules.filter(module => selectedModuleIds.includes(module.id)).length
        return count === 0 ? Qt.Unchecked : count === modules.length ? Qt.Checked : Qt.PartiallyChecked
    }

    function selectModules(modules, checked) {
        const ids = modules.map(module => module.id)
        const remaining = selectedModuleIds.filter(id => !ids.includes(id))
        selectedModuleIds = checked ? remaining.concat(ids) : remaining
    }

    onAboutToShow: {
        title.offset = reducedMotion ? 0 : -100
        card.offset = reducedMotion ? 0 : height
        title.opacity = reducedMotion ? 1 : 0
        card.opacity = reducedMotion ? 1 : 0
    }
    onOpened: {
        if (!reducedMotion)
            entrance.start()
        back.forceActiveFocus()
    }
    onAboutToHide: entrance.stop()

    background: Rectangle { color: "white" }

    contentItem: Item {
        Text {
            id: title
            property real offset: 0
            x: (parent.width - width) / 2
            y: (selection.height < 560 ? 25 : 54) + offset
            text: "选择以下你需要的模块"
            font.family: selection.fontFamily
            font.weight: Font.Medium
            font.pixelSize: selection.width < 900 ? 28 : 34
            color: "#242424"
            renderType: Text.NativeRendering
            Accessible.role: Accessible.Heading
            Accessible.name: text
        }

        Rectangle {
            id: card
            property real offset: 0
            width: Math.min(selection.width - 96, 680)
            height: Math.min(selection.height - 140, 472)
            x: (parent.width - width) / 2
            y: (selection.height < 560 ? 84 : 126) + offset
            color: "#fafafa"
            border.color: "#e9e9e9"
            radius: 24

            ScrollView {
                id: scroll
                anchors.fill: parent
                anchors.margins: 22
                anchors.bottomMargin: 74
                clip: true
                contentWidth: availableWidth
                ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

                Column {
                    width: scroll.availableWidth
                    spacing: 14
                    Repeater {
                        model: selection.groups
                        delegate: Column {
                            id: group
                            required property var modelData
                            width: parent.width
                            spacing: 2

                            ModuleCheckBox {
                                objectName: group.modelData.id
                                width: parent.width
                                text: group.modelData.title
                                groupHeading: true
                                tristate: true
                                checkState: selection.groupState(group.modelData.modules)
                                nextCheckState: function() {
                                    return checkState === Qt.Checked ? Qt.Unchecked : Qt.Checked
                                }
                                onToggleRequested: selection.selectModules(group.modelData.modules,
                                    selection.groupState(group.modelData.modules) !== Qt.Checked)
                            }
                            Repeater {
                                model: group.modelData.modules
                                delegate: ModuleCheckBox {
                                    required property var modelData
                                    objectName: modelData.id
                                    x: 32
                                    width: group.width - 32
                                    text: modelData.title
                                    checked: selection.selectedModuleIds.includes(modelData.id)
                                    onToggleRequested: selection.selectModules([modelData],
                                        !selection.selectedModuleIds.includes(modelData.id))
                                }
                            }
                        }
                    }
                }
            }

            Rectangle {
                x: 24
                y: parent.height - 66
                width: parent.width - 48
                height: 1
                color: "#e9e9e9"
            }
            Text {
                x: 30
                y: parent.height - 46
                text: "已选择 " + selection.selectedModuleIds.length + " 个模块"
                font.family: selection.fontFamily
                font.pixelSize: 15
                color: "#777777"
            }
            Button {
                id: back
                objectName: "back"
                text: "返回"
                width: 88
                height: 38
                anchors.right: parent.right
                anchors.rightMargin: 24
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 14
                onClicked: selection.close()
                background: Rectangle {
                    radius: 10
                    color: back.down ? "#e5e5e5" : back.hovered ? "#ededed" : "white"
                    border.color: back.activeFocus ? "#e78cab" : "#dedede"
                    border.width: back.activeFocus ? 2 : 1
                }
                contentItem: Text {
                    text: back.text
                    font.family: selection.fontFamily
                    font.pixelSize: 15
                    color: "#444444"
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
            }
        }
    }

    component ModuleCheckBox: CheckBox {
        id: control
        property bool groupHeading: false
        signal toggleRequested()
        onClicked: toggleRequested()
        height: 38
        hoverEnabled: true
        activeFocusOnTab: true
        Accessible.name: text
        Accessible.onPressAction: toggleRequested()
        Accessible.onToggleAction: toggleRequested()
        indicator: Rectangle {
            x: 8
            y: (control.height - height) / 2
            width: 20
            height: 20
            radius: 5
            color: control.checkState !== Qt.Unchecked ? "#242424" : "white"
            border.color: control.activeFocus ? "#e78cab" : control.hovered ? "#777777" : "#c9c9c9"
            border.width: control.activeFocus ? 2 : 1
            Rectangle {
                visible: control.checkState === Qt.PartiallyChecked
                anchors.centerIn: parent
                width: 10
                height: 2
                radius: 1
                color: "white"
            }
            Item {
                visible: control.checkState === Qt.Checked
                anchors.centerIn: parent
                width: 13
                height: 12
                Rectangle { x: 1; y: 6; width: 5; height: 2; rotation: 45; color: "white"; radius: 1 }
                Rectangle { x: 4; y: 5; width: 9; height: 2; rotation: -45; color: "white"; radius: 1 }
            }
        }
        contentItem: Text {
            leftPadding: 42
            text: control.text
            font.family: selection.fontFamily
            font.weight: Font.Medium
            font.pixelSize: control.groupHeading ? 19 : 17
            color: control.groupHeading ? "#242424" : "#626262"
            verticalAlignment: Text.AlignVCenter
            renderType: Text.NativeRendering
        }
        background: Rectangle {
            radius: 8
            color: control.hovered ? "#f0f0f0" : "transparent"
        }
    }

    ParallelAnimation {
        id: entrance
        SequentialAnimation {
            NumberAnimation { target: title; property: "offset"; to: 7; duration: 480; easing.type: Easing.OutCubic }
            NumberAnimation { target: title; property: "offset"; to: 0; duration: 180; easing.type: Easing.OutCubic }
        }
        NumberAnimation { target: title; property: "opacity"; to: 1; duration: 260 }
        SequentialAnimation {
            NumberAnimation { target: card; property: "offset"; to: -9; duration: 540; easing.type: Easing.OutCubic }
            NumberAnimation { target: card; property: "offset"; to: 0; duration: 180; easing.type: Easing.OutCubic }
        }
        NumberAnimation { target: card; property: "opacity"; to: 1; duration: 300 }
    }
}
