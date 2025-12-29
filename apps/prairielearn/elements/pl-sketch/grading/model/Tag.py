class Tag:
    def __init__(self):
        self.tag = ""

    def set_tag(self, tag):
        self.tag = tag

    def get_tag(self):
        """Get the value of the tag.

        Returns:
            string:
            The tag string of this object.
        """
        return self.tag

    def tag_equals(self, to_compare, ignore_case=False):
        """Returns whether the given string is equal to the object's tag value.

        Args:
            to_compare: an string value
            ignore_case (default: False): boolean ignore the case of the string

        Returns:
            bool:
            True if the given string is the same as the object's tag,
            otherwise False.
        """
        tag1 = self.tag
        tag2 = to_compare
        if ignore_case:
            tag1 = tag1.lower()
            tag2 = tag2.lower()

        return tag1 == tag2


class Tagables:
    def __init__(self):
        self.tags = None

    def set_tagables(self, tags):
        self.tags = tags

    def contains_tag(self, to_compare, ignore_case=False):
        """Return a reference to the first object found with the given tag value.

        Args:
            to_compare: an string value
            ignore_case (default: False): boolean ignore the case of the string

        Returns:
            Tag:
            The first Tag object with a tag value of to_compare, if there
            are no matching tags, returns None.
        """
        if self.tags is not None:
            for tag in self.tags:
                if tag.tag_equals(to_compare, ignore_case=ignore_case):
                    return tag

        return None
