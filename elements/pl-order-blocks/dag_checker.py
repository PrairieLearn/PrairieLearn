
class AnswerState:
    def __init__(self):
        self.valid = set()  # a block is valid if all blocks that it depends on have appeared before it
        self.current_group = None
        self.current_group_len = 0

    def begin_group(self, group_id):
        self.current_group = group_id

    def end_group(self):
        self.current_group = None
        self.current_group_len = 0

    def set_valid(self, stmt_id):
        self.valid.add(stmt_id)
        if self.current_group is not None:
            self.current_group_len += 1

    def is_valid(self, stmt_id):
        return stmt_id in self.valid

    def get_current_group_blocks(self):
        return self.current_group_len


def grade_dag(order, depends_graph, group_belonging):
    first_wrong = -1
    answer_state = AnswerState()

    group_sizes = {}
    for stmt_id in group_belonging:
        group = group_belonging.get(stmt_id)
        if group is None:
            continue
        if group_sizes.get(group) is None:
            group_sizes[group] = 0
        group_sizes[group] += 1

    for i, block in enumerate(order):
        block_valid = True
        depends = depends_graph.get(block)
        if depends is None:
            block_valid = False
        else:
            for depend in depends:
                if not answer_state.is_valid(depend):
                    block_valid = False

        if block_valid:
            group_id = group_belonging.get(block)
            if group_id is None and answer_state.current_group is None:
                answer_state.set_valid(block)
            elif group_id is not None and answer_state.current_group is None:
                answer_state.begin_group(group_id)
                answer_state.set_valid(block)
            elif group_id is None and answer_state.current_group is not None:
                first_wrong = i
                break
            elif group_id is not None and answer_state.current_group is not None:
                if group_id == answer_state.current_group:
                    answer_state.set_valid(block)
                    if answer_state.get_current_group_blocks() == group_sizes.get(group_id):
                        answer_state.end_group()
                else:
                    first_wrong = i
                    break
        else:
            first_wrong = i
            break

    return len(answer_state.valid), first_wrong
