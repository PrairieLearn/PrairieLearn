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


class QuestionFeedback(object):
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
        'neutral': 'str',
        'correct': 'str',
        'incorrect': 'str'
    }

    attribute_map = {
        'neutral': 'neutral',
        'correct': 'correct',
        'incorrect': 'incorrect'
    }

    def __init__(self, neutral=None, correct=None, incorrect=None, _configuration=None):  # noqa: E501
        """QuestionFeedback - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._neutral = None
        self._correct = None
        self._incorrect = None
        self.discriminator = None

        if neutral is not None:
            self.neutral = neutral
        if correct is not None:
            self.correct = correct
        if incorrect is not None:
            self.incorrect = incorrect

    @property
    def neutral(self):
        """Gets the neutral of this QuestionFeedback.  # noqa: E501

        general feedback to show regardless of answer (rich content)  # noqa: E501

        :return: The neutral of this QuestionFeedback.  # noqa: E501
        :rtype: str
        """
        return self._neutral

    @neutral.setter
    def neutral(self, neutral):
        """Sets the neutral of this QuestionFeedback.

        general feedback to show regardless of answer (rich content)  # noqa: E501

        :param neutral: The neutral of this QuestionFeedback.  # noqa: E501
        :type: str
        """

        self._neutral = neutral

    @property
    def correct(self):
        """Gets the correct of this QuestionFeedback.  # noqa: E501

        feedback to show if the question is answered correctly (rich content)  # noqa: E501

        :return: The correct of this QuestionFeedback.  # noqa: E501
        :rtype: str
        """
        return self._correct

    @correct.setter
    def correct(self, correct):
        """Sets the correct of this QuestionFeedback.

        feedback to show if the question is answered correctly (rich content)  # noqa: E501

        :param correct: The correct of this QuestionFeedback.  # noqa: E501
        :type: str
        """

        self._correct = correct

    @property
    def incorrect(self):
        """Gets the incorrect of this QuestionFeedback.  # noqa: E501

        feedback to show if the question is answered incorrectly (rich content)  # noqa: E501

        :return: The incorrect of this QuestionFeedback.  # noqa: E501
        :rtype: str
        """
        return self._incorrect

    @incorrect.setter
    def incorrect(self, incorrect):
        """Sets the incorrect of this QuestionFeedback.

        feedback to show if the question is answered incorrectly (rich content)  # noqa: E501

        :param incorrect: The incorrect of this QuestionFeedback.  # noqa: E501
        :type: str
        """

        self._incorrect = incorrect

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
        if issubclass(QuestionFeedback, dict):
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
        if not isinstance(other, QuestionFeedback):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuestionFeedback):
            return True

        return self.to_dict() != other.to_dict()
