cmake_minimum_required(VERSION 3.12)
set(CMAKE_DISABLE_SOURCE_CHANGES ON)
set(CMAKE_DISABLE_IN_SOURCE_BUILD ON)
project(FORTRAN_BASICS
    VERSION 0.1.0
    LANGUAGES Fortran
)

include(GNUInstallDirs)


#-----------------------------------------------------------------------
# Configuration
#-----------------------------------------------------------------------

# Establish if we are part of a bigger project
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    set(PROJECT_IS_TOP_LEVEL TRUE)
else()
    set(PROJECT_IS_TOP_LEVEL FALSE)
endif()

if(PROJECT_IS_TOP_LEVEL)

    # Default Install Path: Local install in current build dir
    if(CMAKE_INSTALL_PREFIX_INITIALIZED_TO_DEFAULT)
        set(CMAKE_INSTALL_PREFIX "${CMAKE_BINARY_DIR}/install"
            CACHE PATH "${PROJECT_NAME} installation directory"
            FORCE)
        set(CMAKE_INSTALL_PREFIX_INITIALIZED_TO_DEFAULT FALSE)
        message(STATUS "Setting install path to '${CMAKE_INSTALL_PREFIX}' since none specified.")
    endif()

    # Default Build Type: Standard release build
    if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
        set(CMAKE_BUILD_TYPE Release CACHE STRING "Choose the type of build." FORCE)
        set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS
            "Debug" "Release" "MinSizeRel" "RelWithDebInfo")
        message(STATUS "Setting build type to 'Release' since none specified.")
    endif()

endif()

# Testing
option(FB_BUILD_TESTING "Build test harness for ${PROJECT_NAME}" ${PROJECT_IS_TOP_LEVEL})
if(FB_BUILD_TESTING)
    find_package(PFUNIT REQUIRED)
    include(CTest)
endif()


#-----------------------------------------------------------------------
# Targets
#-----------------------------------------------------------------------
add_subdirectory(source)


#-----------------------------------------------------------------------
# Installation
#-----------------------------------------------------------------------
install(EXPORT fbasics-config
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/fbasics
    NAMESPACE fbasics::
    FILE fbasics-config.cmake
)
