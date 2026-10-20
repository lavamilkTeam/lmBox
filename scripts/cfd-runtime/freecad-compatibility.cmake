# Qt 6.8's imported OpenGL wrapper adds the obsolete Carbon AGL framework even
# for arm64. The Qt arm64 dylibs do not use AGL, and recent macOS SDKs omit it.
function(lmbox_freecad_fix_opengl_import)
    if(APPLE AND TARGET WrapOpenGL::WrapOpenGL)
        get_target_property(links WrapOpenGL::WrapOpenGL INTERFACE_LINK_LIBRARIES)
        list(REMOVE_ITEM links "-framework AGL")
        list(FILTER links EXCLUDE REGEX "(^|/)AGL\\.framework$")
        set_target_properties(WrapOpenGL::WrapOpenGL PROPERTIES INTERFACE_LINK_LIBRARIES "${links}")
    endif()
endfunction()
cmake_language(DEFER CALL lmbox_freecad_fix_opengl_import)
