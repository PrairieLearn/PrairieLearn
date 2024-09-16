# coding: utf-8

"""

    No description provided (generated by Swagger Codegen https://github.com/swagger-api/swagger-codegen)  # noqa: E501

    OpenAPI spec version: 1.0
    
    Generated by: https://github.com/swagger-api/swagger-codegen.git
"""


import pprint
import re  # noqa: F401

import six

from swagger_client.configuration import Configuration


class QuizAssignmentOverrideSet(object):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """

    """
    Attributes:
      swagger_types (dict): The key is attribute name
                            and the value is attribute type.
      attribute_map (dict): The key is attribute name
                            and the value is json key in definition.
    """
    swagger_types = {
        'quiz_id': 'str',
        'due_dates': 'QuizAssignmentOverride',
        'all_dates': 'QuizAssignmentOverride'
    }

    attribute_map = {
        'quiz_id': 'quiz_id',
        'due_dates': 'due_dates',
        'all_dates': 'all_dates'
    }

    def __init__(self, quiz_id=None, due_dates=None, all_dates=None, _configuration=None):  # noqa: E501
        """QuizAssignmentOverrideSet - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._quiz_id = None
        self._due_dates = None
        self._all_dates = None
        self.discriminator = None

        if quiz_id is not None:
            self.quiz_id = quiz_id
        if due_dates is not None:
            self.due_dates = due_dates
        if all_dates is not None:
            self.all_dates = all_dates

    @property
    def quiz_id(self):
        """Gets the quiz_id of this QuizAssignmentOverrideSet.  # noqa: E501

        ID of the quiz those dates are for.  # noqa: E501

        :return: The quiz_id of this QuizAssignmentOverrideSet.  # noqa: E501
        :rtype: str
        """
        return self._quiz_id

    @quiz_id.setter
    def quiz_id(self, quiz_id):
        """Sets the quiz_id of this QuizAssignmentOverrideSet.

        ID of the quiz those dates are for.  # noqa: E501

        :param quiz_id: The quiz_id of this QuizAssignmentOverrideSet.  # noqa: E501
        :type: str
        """

        self._quiz_id = quiz_id

    @property
    def due_dates(self):
        """Gets the due_dates of this QuizAssignmentOverrideSet.  # noqa: E501

        An array of quiz assignment overrides. For students, this array will always contain a single item which is the set of dates that apply to that student. For teachers and staff, it may contain more.  # noqa: E501

        :return: The due_dates of this QuizAssignmentOverrideSet.  # noqa: E501
        :rtype: QuizAssignmentOverride
        """
        return self._due_dates

    @due_dates.setter
    def due_dates(self, due_dates):
        """Sets the due_dates of this QuizAssignmentOverrideSet.

        An array of quiz assignment overrides. For students, this array will always contain a single item which is the set of dates that apply to that student. For teachers and staff, it may contain more.  # noqa: E501

        :param due_dates: The due_dates of this QuizAssignmentOverrideSet.  # noqa: E501
        :type: QuizAssignmentOverride
        """

        self._due_dates = due_dates

    @property
    def all_dates(self):
        """Gets the all_dates of this QuizAssignmentOverrideSet.  # noqa: E501

        An array of all assignment overrides active for the quiz. This is visible only to teachers and staff.  # noqa: E501

        :return: The all_dates of this QuizAssignmentOverrideSet.  # noqa: E501
        :rtype: QuizAssignmentOverride
        """
        return self._all_dates

    @all_dates.setter
    def all_dates(self, all_dates):
        """Sets the all_dates of this QuizAssignmentOverrideSet.

        An array of all assignment overrides active for the quiz. This is visible only to teachers and staff.  # noqa: E501

        :param all_dates: The all_dates of this QuizAssignmentOverrideSet.  # noqa: E501
        :type: QuizAssignmentOverride
        """

        self._all_dates = all_dates

    def to_dict(self):
        """Returns the model properties as a dict"""
        result = {}

        for attr, _ in six.iteritems(self.swagger_types):
            value = getattr(self, attr)
            if isinstance(value, list):
                result[attr] = list(map(
                    lambda x: x.to_dict() if hasattr(x, "to_dict") else x,
                    value
                ))
            elif hasattr(value, "to_dict"):
                result[attr] = value.to_dict()
            elif isinstance(value, dict):
                result[attr] = dict(map(
                    lambda item: (item[0], item[1].to_dict())
                    if hasattr(item[1], "to_dict") else item,
                    value.items()
                ))
            else:
                result[attr] = value
        if issubclass(QuizAssignmentOverrideSet, dict):
            for key, value in self.items():
                result[key] = value

        return result

    def to_str(self):
        """Returns the string representation of the model"""
        return pprint.pformat(self.to_dict())

    def __repr__(self):
        """For `print` and `pprint`"""
        return self.to_str()

    def __eq__(self, other):
        """Returns true if both objects are equal"""
        if not isinstance(other, QuizAssignmentOverrideSet):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuizAssignmentOverrideSet):
            return True

        return self.to_dict() != other.to_dict()
