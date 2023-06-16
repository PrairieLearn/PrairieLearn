# Map attribute back to index
col_idx = {attribute: idx for idx, attribute in enumerate(all_attributes)}

row, col, data = map(
    list,  # Convert zipped result from tuple to list
    zip(
        *[  # Unzip the list of triples into three tuples
            # Each non-zero entry can be represented as a (row, col, val) triples
            (rowid, col_idx[attribute], value)
            for rowid, player in enumerate(player_attributes)
            for attribute, value in player.items()
        ]
    ),
)
