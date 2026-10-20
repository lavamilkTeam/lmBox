#include <Python.h>

/* Use one shared CPython runtime for the interpreter and FreeCAD extensions. */
int main(int argc, char **argv)
{
    return Py_BytesMain(argc, argv);
}
