#------------------------------------------------------------------------------
# Boilerplate for installed libraries
#------------------------------------------------------------------------------
function(add_installed_library fullname)
    # usage: add_installed_library(namespace_libname ...)
    #
    # Splits fullname on first underscore into ${namespace} and ${libname}
    # Creates requested target and an alias "${namespace}::${libname}"
    # Correctly exposes Fortran modules produced by the library
    # Configures the library for installation and config file export
    #
    #set(fullname "${namespaces}_${libname}")

    # Split fullname into namespace and libname
    string(FIND ${fullname} "_" index)
    string(SUBSTRING ${fullname} 0 ${index} namespace)
    math(EXPR index "${index}+1")
    string(SUBSTRING ${fullname} ${index} -1 libname)

    # Fortran module paths
    set(mod_build_dir "${CMAKE_CURRENT_BINARY_DIR}/modules")
    set(mod_install_dir "${CMAKE_INSTALL_INCLUDEDIR}/${namespace}/${libname}")

    # Basic definition
    add_library(${fullname} ${ARGN})
    add_library("${namespace}::${libname}" ALIAS ${fullname})
    set_target_properties(${fullname} PROPERTIES
        EXPORT_NAME ${libname}
        Fortran_MODULE_DIRECTORY ${mod_build_dir}
    )

    # Expose module files
    target_include_directories(${fullname} PUBLIC
        $<BUILD_INTERFACE:${mod_build_dir}>
        $<INSTALL_INTERFACE:${mod_install_dir}>
    )

    # Install logic
    install(TARGETS ${fullname}
        EXPORT ${namespace}-config
        DESTINATION ${CMAKE_INSTALL_LIBDIR})
    install(DIRECTORY "${mod_build_dir}/"  # Trailing slash => copy contents
        DESTINATION ${mod_install_dir})

endfunction()
