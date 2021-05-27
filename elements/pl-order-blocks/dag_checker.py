
class ProofState:
    def __init__(self):
        self.proven = set()
        self.current_subproof = None
        self.current_subproof_len = 0

    def begin_subproof(self, subproof_id):
        self.current_subproof = subproof_id

    def end_subproof(self):
        self.current_subproof = None 
        self.current_subproof_len = 0

    def set_proven(self, stmt_id):
        self.proven.add(stmt_id)
        if self.current_subproof is not None: 
            self.current_subproof_len += 1

    def is_proven(self, stmt_id):
        return stmt_id in self.proven

    def get_current_subproof_lines(self):
        return self.current_subproof_len


def grade_dag(order, depends_graph, subproof_belonging):
    first_wrong = -1
    proof_state = ProofState()

    subproof_sizes = {}
    for stmt_id in subproof_belonging:
        subproof = subproof_belonging.get(stmt_id)
        if subproof is None:
            continue
        if subproof_sizes.get(subproof) is None:
            subproof_sizes[subproof] = 0
        subproof_sizes[subproof] += 1

    for i, line in enumerate(order):
        line_proven = True
        depends = depends_graph.get(line)
        if depends is None: # statement is not in the proof
            line_proven = False
        else:
            for depend in depends:
                if not proof_state.is_proven(depend):
                    line_proven = False
        
        if line_proven:
            subproof_id = subproof_belonging.get(line)
            if subproof_id is None and proof_state.current_subproof is None:
                proof_state.set_proven(line)
            elif subproof_id is not None and proof_state.current_subproof is None:
                proof_state.begin_subproof(subproof_id)
                proof_state.set_proven(line)
            elif subproof_id is None and proof_state.current_subproof is not None:
                first_wrong = i
                break
            elif subproof_id is not None and proof_state.current_subproof is not None:
                if subproof_id == proof_state.current_subproof:
                    proof_state.set_proven(line)
                    if proof_state.get_current_subproof_lines() == subproof_sizes.get(subproof_id):
                        proof_state.end_subproof()
                else:
                    first_wrong = i
                    break
        else:
            first_wrong = i
            break

    return len(proof_state.proven), first_wrong

