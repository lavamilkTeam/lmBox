// Replacement for cfMesh-CfdOF 1.32 polyMeshGen::fillInCellAndPointLevels.
// Derived from the GPL-3.0-or-later upstream implementation; see its COPYRIGHT.
void polyMeshGen::fillInCellAndPointLevels()
{
    const VRWGraph& cellCells = addressingData().cellCells();
    const labelList& faceOwner = owner();
    const PtrList<processorBoundaryPatch>& patches = procBoundaries();
    const label protectedSetId = addCellSubset("meshProtectedCells");
    forAll(cellLevel_, cellI)
    {
        if (cellLevel_[cellI] == -1)
            cellSubsets_[protectedSetId].addElement(cellI);
    }

    // Resolve one layer at a time, including neighbours across processor faces.
    // Ranks with no local unresolved cells must still participate in exchanges.
    while (true)
    {
        labelList nextLevel(cellLevel_);
        forAll(cellCells, cellI)
        {
            if (cellLevel_[cellI] != -1)
                continue;
            forAllRow(cellCells, cellI, i)
                nextLevel[cellI] = max(nextLevel[cellI], cellLevel_[cellCells(cellI, i)]);
        }

        if (Pstream::parRun())
        {
            PstreamBuffers buffers(Pstream::commsTypes::nonBlocking);
            forAll(patches, patchI)
            {
                const processorBoundaryPatch& patch = patches[patchI];
                labelList levels(patch.patchSize());
                forAll(levels, faceI)
                    levels[faceI] = cellLevel_[faceOwner[patch.patchStart() + faceI]];
                UOPstream toNeighbour(patch.neiProcNo(), buffers);
                toNeighbour << levels;
            }
            buffers.finishedSends();
            forAll(patches, patchI)
            {
                const processorBoundaryPatch& patch = patches[patchI];
                labelList levels;
                UIPstream fromNeighbour(patch.neiProcNo(), buffers);
                fromNeighbour >> levels;
                if (levels.size() != patch.patchSize())
                    FatalErrorIn("polyMeshGen::fillInCellAndPointLevels")
                        << "Mismatched processor face levels" << abort(FatalError);
                forAll(levels, faceI)
                {
                    const label cellI = faceOwner[patch.patchStart() + faceI];
                    if (cellLevel_[cellI] == -1)
                        nextLevel[cellI] = max(nextLevel[cellI], levels[faceI]);
                }
            }
        }

        label unresolved = 0;
        label resolved = 0;
        forAll(cellLevel_, cellI)
        {
            if (cellLevel_[cellI] == -1 && nextLevel[cellI] != -1)
                ++resolved;
            cellLevel_[cellI] = nextLevel[cellI];
            if (cellLevel_[cellI] == -1)
                ++unresolved;
        }
        reduce(unresolved, sumOp<label>());
        reduce(resolved, sumOp<label>());
        if (unresolved == 0)
            break;
        if (resolved == 0)
            FatalErrorIn("polyMeshGen::fillInCellAndPointLevels")
                << "Cannot infer cell levels for " << unresolved
                << " cells without a connected known level" << abort(FatalError);
    }

    // Preserve upstream protection of newly added points from mesh refinement.
    const VRWGraph& pointCells = addressingData().pointCells();
    forAll(pointCells, pointI)
    {
        if (pointLevel_[pointI] == -1)
            pointLevel_[pointI] = labelMax;
    }
}
