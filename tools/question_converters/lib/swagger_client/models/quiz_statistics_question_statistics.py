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


class QuizStatisticsQuestionStatistics(object):
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
        'responses': 'int',
        'answers': 'QuizStatisticsAnswerStatistics'
    }

    attribute_map = {
        'responses': 'responses',
        'answers': 'answers'
    }

    def __init__(self, responses=None, answers=None, _configuration=None):  # noqa: E501
        """QuizStatisticsQuestionStatistics - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._responses = None
        self._answers = None
        self.discriminator = None

        if responses is not None:
            self.responses = responses
        if answers is not None:
            self.answers = answers

    @property
    def responses(self):
        """Gets the responses of this QuizStatisticsQuestionStatistics.  # noqa: E501

        Number of students who have provided an answer to this question. Blank or empty responses are not counted.  # noqa: E501

        :return: The responses of this QuizStatisticsQuestionStatistics.  # noqa: E501
        :rtype: int
        """
        return self._responses

    @responses.setter
    def responses(self, responses):
        """Sets the responses of this QuizStatisticsQuestionStatistics.

        Number of students who have provided an answer to this question. Blank or empty responses are not counted.  # noqa: E501

        :param responses: The responses of this QuizStatisticsQuestionStatistics.  # noqa: E501
        :type: int
        """

        self._responses = responses

    @property
    def answers(self):
        """Gets the answers of this QuizStatisticsQuestionStatistics.  # noqa: E501

        Statistics related to each individual pre-defined answer.  # noqa: E501

        :return: The answers of this QuizStatisticsQuestionStatistics.  # noqa: E501
        :rtype: QuizStatisticsAnswerStatistics
        """
        return self._answers

    @answers.setter
    def answers(self, answers):
        """Sets the answers of this QuizStatisticsQuestionStatistics.

        Statistics related to each individual pre-defined answer.  # noqa: E501

        :param answers: The answers of this QuizStatisticsQuestionStatistics.  # noqa: E501
        :type: QuizStatisticsAnswerStatistics
        """

        self._answers = answers

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
        if issubclass(QuizStatisticsQuestionStatistics, dict):
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
        if not isinstance(other, QuizStatisticsQuestionStatistics):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuizStatisticsQuestionStatistics):
            return True

        return self.to_dict() != other.to_dict()
