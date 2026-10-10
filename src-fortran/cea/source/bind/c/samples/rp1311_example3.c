#include "stdio.h"
#include "cea.h"

#define LEN(x)  (sizeof(x) / sizeof((x)[0]))
#define BAR     10000.00

int main(void) {

    //------------------------------------------------------------------
    // Problem Specification
    //------------------------------------------------------------------

    // Species
    const cea_string reactants[]     = {  "Air", "C7H8(L)", "C8H18(L),n-octa" };
    const cea_real reactant_temps[]  = { 700.00,    298.15,            298.15 };
    const cea_real fuel_weights[]    = {    0.0,       0.4,               0.6 };
    const cea_real oxidant_weights[] = {    1.0,       0.0,               0.0 };

    // Products
    const cea_string omitted_products[] = {
        "CCN",              "CNC",              "C2N2",             "C2O",
        "C3H4,allene",      "C3H4,propyne",     "C3H4,cyclo-",      "C3",
        "C3H5,allyl",       "C3H6,propylene",   "C3H6,cyclo-",      "C3H3,propargyl",
        "C3H6O",            "C3H7,n-propyl",    "C3H7,i-propyl",    "Jet-A(g)",
        "C3O2",             "C4",               "C4H2",             "C3H8O,2propanol",
        "C4H4,1,3-cyclo-",  "C4H6,butadiene",   "C4H6,2-butyne",    "C3H8O,1propanol",
        "C4H8,tr2-butene",  "C4H8,isobutene",   "C4H8,cyclo-",      "C4H6,cyclo-",
        "(CH3COOH)2",       "C4H9,n-butyl",     "C4H9,i-butyl",     "C4H8,1-butene",
        "C4H9,s-butyl",     "C4H9,t-butyl",     "C4H10,isobutane",  "C4H8,cis2-buten",
        "C4H10,n-butane",   "C4N2",             "C5",               "C3H8",
        "C5H6,1,3cyclo-",   "C5H8,cyclo-",      "C5H10,1-pentene",  "C10H21,n-decyl",
        "C5H10,cyclo-",     "C5H11,pentyl",     "C5H11,t-pentyl",   "C12H10,biphenyl",
        "C5H12,n-pentane",  "C5H12,i-pentane",  "CH3C(CH3)2CH3",    "C12H9,o-bipheny",
        "C6H6",             "C6H5OH,phenol",    "C6H10,cyclo-",     "C6H2",
        "C6H12,1-hexene",   "C6H12,cyclo-",     "C6H13,n-hexyl",    "C6H5,phenyl",
        "C7H7,benzyl",      "C7H8",             "C7H8O,cresol-mx",  "C6H5O,phenoxy",
        "C7H14,1-heptene",  "C7H15,n-heptyl",   "C7H16,n-heptane",  "C10H8,azulene",
        "C8H8,styrene",     "C8H10,ethylbenz",  "C8H16,1-octene",   "C10H8,napthlene",
        "C8H17,n-octyl",    "C8H18,isooctane",  "C8H18,n-octane",   "C9H19,n-nonyl",
        "Jet-A(L)",         "C6H6(L)",          "H2O(s)",           "H2O(L)"
    };

    // Thermo States
    const cea_real pressures[] = { 100.0*BAR, 10.0*BAR, 1.0*BAR };
    const cea_real of_ratio    = 17.0;

    cea_set_log_level(CEA_LOG_DEBUG);
    cea_init();

    // Mixtures
    cea_mixture reac, prod;
    cea_mixture_create(&reac, LEN(reactants), reactants);
    cea_mixture_create_from_reactants(&prod,
        LEN(reactants), reactants,
        LEN(omitted_products), omitted_products
    );

    // Solver
    cea_eqsolver solver;
    cea_eqsolver_create_with_reactants(&solver, prod, reac);

    // Solution
    cea_eqsolution soln;
    cea_eqsolution_create(&soln, solver);

    printf(
        "%12s %12s %15s %15s %15s \n",
        "P (Pa)", "O/F Ratio", "T (K)", "H (J/kg)", "Cp (J/kg-K)"
    );

    cea_real weights[LEN(reactants)];
    cea_mixture_of_ratio_to_weights(reac, LEN(reactants), oxidant_weights, fuel_weights, of_ratio, weights);

    cea_real enthalpy;
    cea_mixture_calc_property_multitemp(reac, CEA_ENTHALPY, LEN(reactants), weights, LEN(reactants), reactant_temps, &enthalpy);

    for (int ip=0; ip < LEN(pressures); ++ip) {

        cea_eqsolver_solve(solver, CEA_HP, enthalpy, pressures[ip], weights, soln);

        cea_real temperature, heat_capacity;
        cea_eqsolution_get_property(soln, CEA_TEMPERATURE, &temperature);
        cea_eqsolution_get_property(soln, CEA_EQUILIBRIUM_CP, &heat_capacity);

        printf(
            "%12.2f %12.2f %15.6e %15.6e %15.6e \n",
            pressures[ip], of_ratio, temperature, enthalpy, heat_capacity
        );

    }

    cea_eqsolution_destroy(&soln);
    cea_eqsolver_destroy(&solver);
    cea_mixture_destroy(&prod);
    cea_mixture_destroy(&reac);

    return 0;

}
