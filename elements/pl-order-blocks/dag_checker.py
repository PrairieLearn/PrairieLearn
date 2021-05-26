
class ProofState:
    def __init__(self):
        self.proven = set()
        self.currentSubproof = None
        self.currentSubproofLen = 0

    def beginSubproof(self, subproofId):
        self.currentSubproof = subproofId

    def endSubproof(self):
        self.currentSubproof = None 
        self.currentSubproofLen = 0

    def setProven(self, stmtId):
        self.proven.add(stmtId)
        if self.currentSubproof is not None: 
            self.currentSubproofLen += 1

    def isProven(self, stmtId):
        return stmtId in self.proven

    def getCurrentSubproofLines(self):
        return self.currentSubproofLen


def grade_dag(order, dependsGraph, subproofBelonging):
    first_wrong = -1
    proofState = ProofState()

    subproofSizes = {}
    for stmtId in subproofBelonging:
        subproof = subproofBelonging.get(stmtId)
        if subproof is None:
            continue
        if subproofSizes.get(subproof) is None:
            subproofSizes[subproof] = 0
        subproofSizes[subproof] += 1

    for i, line in enumerate(order):
        lineProven = True
        depends = dependsGraph.get(line)
        if depends is None: # statement is not in the proof
            lineProven = False
        else:
            for depend in depends:
                if not proofState.isProven(depend):
                    lineProven = False
        
        if lineProven:
            subproofId = subproofBelonging.get(line)
            if subproofId is None and proofState.currentSubproof is None:
                proofState.setProven(line)
            elif subproofId is not None and proofState.currentSubproof is None:
                proofState.beginSubproof(subproofId)
                proofState.setProven(line)
            elif subproofId is None and proofState.currentSubproof is not None:
                first_wrong = i
                break
            elif subproofId is not None and proofState.currentSubproof is not None:
                if subproofId == proofState.currentSubproof:
                    proofState.setProven(line)
                    if proofState.getCurrentSubproofLines() == subproofSizes.get(subproofId):
                        proofState.endSubproof()
                else:
                    first_wrong = i
                    break
        else:
            first_wrong = i
            break

    return len(proofState.proven), first_wrong

