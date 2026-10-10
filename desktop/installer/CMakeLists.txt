cmake_minimum_required(VERSION 3.21)
project(LmBoxInstaller VERSION 0.1.1 LANGUAGES CXX)

find_package(Qt6 6.8 REQUIRED COMPONENTS Quick QuickControls2)
qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(lmbox-installer MACOSX_BUNDLE WIN32 src/main.cpp)
target_compile_features(lmbox-installer PRIVATE cxx_std_17)
target_link_libraries(lmbox-installer PRIVATE Qt6::Quick Qt6::QuickControls2)
set_target_properties(lmbox-installer PROPERTIES
    MACOSX_BUNDLE_BUNDLE_NAME "lmBox Installer"
    MACOSX_BUNDLE_GUI_IDENTIFIER "app.lmbox.installer"
    MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}"
)

set_source_files_properties(ui/Welcome.qml PROPERTIES QT_RESOURCE_ALIAS Welcome.qml)
set_source_files_properties(ui/ModuleSelection.qml PROPERTIES QT_RESOURCE_ALIAS ModuleSelection.qml)
qt_add_qml_module(lmbox-installer
    URI LmBox.Installer
    VERSION 1.0
    QML_FILES ui/Welcome.qml ui/ModuleSelection.qml
)

set(welcome_assets "${CMAKE_CURRENT_SOURCE_DIR}/../../frontend/ui/installer-welcome/lib/assets")
qt_add_resources(lmbox-installer welcome_assets
    PREFIX "/installer/assets"
    BASE "${welcome_assets}"
    FILES
        "${welcome_assets}/pig.gif"
        "${welcome_assets}/pig-still.png"
        "${welcome_assets}/welcome-soft.ttf"
        "${welcome_assets}/FONT-LICENSE.txt"
        "${welcome_assets}/NOTICE.txt"
)

include(GNUInstallDirs)
install(TARGETS lmbox-installer BUNDLE DESTINATION . RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
install(FILES "${welcome_assets}/FONT-LICENSE.txt" "${welcome_assets}/NOTICE.txt" DESTINATION licenses)
qt_generate_deploy_qml_app_script(
    TARGET lmbox-installer
    OUTPUT_SCRIPT deploy_script
)
install(SCRIPT ${deploy_script})
