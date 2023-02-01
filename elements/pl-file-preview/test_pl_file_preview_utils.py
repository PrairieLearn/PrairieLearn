from pl_file_preview_utils import order_files


def test_order_files():
    ordered_files = order_files([{"name": "b.py"}, {"name": "a.py"}], ["a.py", "b.py"])
    assert ordered_files == [{"name": "a.py"}, {"name": "b.py"}]


def test_order_files_missing_required_file():
    ordered_files = order_files(
        [{"name": "c.py"}, {"name": "b.py"}, {"name": "a.py"}], ["a.py", "b.py"]
    )
    assert ordered_files == [{"name": "a.py"}, {"name": "b.py"}, {"name": "c.py"}]


def test_order_files_missing_name():
    ordered_files = order_files(
        [{"not_name": "b.py"}, {"name": "a.py"}], ["a.py", "b.py"]
    )
    assert ordered_files == [{"name": "a.py"}, {"not_name": "b.py"}]
