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


class QuizStatisticsAnswerStatistics(object):
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
        'id': 'int',
        'text': 'str',
        'weight': 'int',
        'responses': 'int'
    }

    attribute_map = {
        'id': 'id',
        'text': 'text',
        'weight': 'weight',
        'responses': 'responses'
    }

    def __init__(self, id=None, text=None, weight=None, responses=None, _configuration=None):  # noqa: E501
        """QuizStatisticsAnswerStatistics - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._text = None
        self._weight = None
        self._responses = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if text is not None:
            self.text = text
        if weight is not None:
            self.weight = weight
        if responses is not None:
            self.responses = responses

    @property
    def id(self):
        """Gets the id of this QuizStatisticsAnswerStatistics.  # noqa: E501

        ID of the answer.  # noqa: E501

        :return: The id of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this QuizStatisticsAnswerStatistics.

        ID of the answer.  # noqa: E501

        :param id: The id of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def text(self):
        """Gets the text of this QuizStatisticsAnswerStatistics.  # noqa: E501

        The text attached to the answer.  # noqa: E501

        :return: The text of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :rtype: str
        """
        return self._text

    @text.setter
    def text(self, text):
        """Sets the text of this QuizStatisticsAnswerStatistics.

        The text attached to the answer.  # noqa: E501

        :param text: The text of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :type: str
        """

        self._text = text

    @property
    def weight(self):
        """Gets the weight of this QuizStatisticsAnswerStatistics.  # noqa: E501

        An integer to determine correctness of the answer. Incorrect answers should be 0, correct answers should 100  # noqa: E501

        :return: The weight of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :rtype: int
        """
        return self._weight

    @weight.setter
    def weight(self, weight):
        """Sets the weight of this QuizStatisticsAnswerStatistics.

        An integer to determine correctness of the answer. Incorrect answers should be 0, correct answers should 100  # noqa: E501

        :param weight: The weight of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :type: int
        """

        self._weight = weight

    @property
    def responses(self):
        """Gets the responses of this QuizStatisticsAnswerStatistics.  # noqa: E501

        Number of students who have chosen this answer.  # noqa: E501

        :return: The responses of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :rtype: int
        """
        return self._responses

    @responses.setter
    def responses(self, responses):
        """Sets the responses of this QuizStatisticsAnswerStatistics.

        Number of students who have chosen this answer.  # noqa: E501

        :param responses: The responses of this QuizStatisticsAnswerStatistics.  # noqa: E501
        :type: int
        """

        self._responses = responses

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
        if issubclass(QuizStatisticsAnswerStatistics, dict):
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
        if not isinstance(other, QuizStatisticsAnswerStatistics):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuizStatisticsAnswerStatistics):
            return True

        return self.to_dict() != other.to_dict()
