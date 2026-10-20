import andTutorial from './and-truth-table.gif'
import orTutorial from './or-truth-table.gif'
import notTutorial from './not-truth-table.gif'
import nandTutorial from './nand-truth-table.gif'
import norTutorial from './nor-truth-table.gif'
import xorTutorial from './xor-truth-table.gif'
import xnorTutorial from './xnor-truth-table.gif'
import bufTutorial from './buf-truth-table.gif'

export const logicGateTutorials: Readonly<Partial<Record<string, string>>> = {
  and: andTutorial,
  or: orTutorial,
  not: notTutorial,
  nand: nandTutorial,
  nor: norTutorial,
  xor: xorTutorial,
  xnor: xnorTutorial,
  buf: bufTutorial,
}
