#include "propulsion.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#define CHECK(condition) do { if (!(condition)) { fprintf(stderr, "ABI check failed at line %d\n", __LINE__); return 1; } } while (0)
int main(void) {
  char message[256];
  lmbox_nozzle_input input = {1000000, 1, 0, 4, 0.5, 15, 0, 0, 0, 4};
  lmbox_exit_conditions gas = {1000, 1.5, 10000};
  lmbox_nozzle_output output;
  int32_t written = -1;
  struct { double before, values[9], after; } x = {123, {0}, 456}, radius = {789, {0}, 321};
  CHECK(lmbox_propulsion_version() == 1);
  CHECK(lmbox_nozzle_validate(&input, message) == 0 && message[0] == '\0');
  CHECK(lmbox_nozzle_calculate(&input, &gas, &output, 8, &written, x.values, radius.values, message) != 0);
  CHECK(written == 0 && message[0] != '\0' && memchr(message, 0, 256) != NULL);
  CHECK(lmbox_nozzle_calculate(&input, &gas, &output, -1, &written, x.values, radius.values, message) != 0);
  CHECK(written == 0);
  CHECK(lmbox_nozzle_calculate(&input, &gas, &output, 9, &written, x.values, radius.values, message) == 0);
  CHECK(written == 9 && message[0] == '\0');
  CHECK(x.before == 123 && x.after == 456 && radius.before == 789 && radius.after == 321);
  CHECK(fabs(output.throat_area - 0.001) < 1e-15 && fabs(output.thrust - 1540) < 1e-10);
  input.kind = 999;
  CHECK(lmbox_nozzle_validate(&input, message) != 0);
  input.kind = 0; input.segments = 2147483647;
  CHECK(lmbox_nozzle_validate(&input, message) != 0);
  lmbox_liquid_input liquid = {1000, 0.001, 100000, 0.7, 0, 10, 0};
  lmbox_liquid_output ox, fuel;
  CHECK(lmbox_injector_calculate(0.3, 2, &liquid, &liquid, &ox, &fuel, message) == 0);
  CHECK(fabs(ox.mass_flow - 0.2) < 1e-14 && fabs(fuel.mass_flow - 0.1) < 1e-14);
  liquid.kind = 999;
  CHECK(lmbox_injector_calculate(0.3, 2, &liquid, &liquid, &ox, &fuel, message) != 0);
  return 0;
}
