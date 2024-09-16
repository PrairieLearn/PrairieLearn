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


class QuizGroup(object):
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
        'quiz_id': 'int',
        'name': 'str',
        'pick_count': 'int',
        'question_points': 'int',
        'assessment_question_bank_id': 'int',
        'position': 'int'
    }

    attribute_map = {
        'id': 'id',
        'quiz_id': 'quiz_id',
        'name': 'name',
        'pick_count': 'pick_count',
        'question_points': 'question_points',
        'assessment_question_bank_id': 'assessment_question_bank_id',
        'position': 'position'
    }

    def __init__(self, id=None, quiz_id=None, name=None, pick_count=None, question_points=None, assessment_question_bank_id=None, position=None, _configuration=None):  # noqa: E501
        """QuizGroup - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._quiz_id = None
        self._name = None
        self._pick_count = None
        self._question_points = None
        self._assessment_question_bank_id = None
        self._position = None
        self.discriminator = None

        self.id = id
        self.quiz_id = quiz_id
        if name is not None:
            self.name = name
        if pick_count is not None:
            self.pick_count = pick_count
        if question_points is not None:
            self.question_points = question_points
        if assessment_question_bank_id is not None:
            self.assessment_question_bank_id = assessment_question_bank_id
        if position is not None:
            self.position = position

    @property
    def id(self):
        """Gets the id of this QuizGroup.  # noqa: E501

        The ID of the question group.  # noqa: E501

        :return: The id of this QuizGroup.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this QuizGroup.

        The ID of the question group.  # noqa: E501

        :param id: The id of this QuizGroup.  # noqa: E501
        :type: int
        """
        if self._configuration.client_side_validation and id is None:
            raise ValueError("Invalid value for `id`, must not be `None`")  # noqa: E501

        self._id = id

    @property
    def quiz_id(self):
        """Gets the quiz_id of this QuizGroup.  # noqa: E501

        The ID of the Quiz the question group belongs to.  # noqa: E501

        :return: The quiz_id of this QuizGroup.  # noqa: E501
        :rtype: int
        """
        return self._quiz_id

    @quiz_id.setter
    def quiz_id(self, quiz_id):
        """Sets the quiz_id of this QuizGroup.

        The ID of the Quiz the question group belongs to.  # noqa: E501

        :param quiz_id: The quiz_id of this QuizGroup.  # noqa: E501
        :type: int
        """
        if self._configuration.client_side_validation and quiz_id is None:
            raise ValueError("Invalid value for `quiz_id`, must not be `None`")  # noqa: E501

        self._quiz_id = quiz_id

    @property
    def name(self):
        """Gets the name of this QuizGroup.  # noqa: E501

        The name of the question group.  # noqa: E501

        :return: The name of this QuizGroup.  # noqa: E501
        :rtype: str
        """
        return self._name

    @name.setter
    def name(self, name):
        """Sets the name of this QuizGroup.

        The name of the question group.  # noqa: E501

        :param name: The name of this QuizGroup.  # noqa: E501
        :type: str
        """

        self._name = name

    @property
    def pick_count(self):
        """Gets the pick_count of this QuizGroup.  # noqa: E501

        The number of questions to pick from the group to display to the student.  # noqa: E501

        :return: The pick_count of this QuizGroup.  # noqa: E501
        :rtype: int
        """
        return self._pick_count

    @pick_count.setter
    def pick_count(self, pick_count):
        """Sets the pick_count of this QuizGroup.

        The number of questions to pick from the group to display to the student.  # noqa: E501

        :param pick_count: The pick_count of this QuizGroup.  # noqa: E501
        :type: int
        """

        self._pick_count = pick_count

    @property
    def question_points(self):
        """Gets the question_points of this QuizGroup.  # noqa: E501

        The amount of points allotted to each question in the group.  # noqa: E501

        :return: The question_points of this QuizGroup.  # noqa: E501
        :rtype: int
        """
        return self._question_points

    @question_points.setter
    def question_points(self, question_points):
        """Sets the question_points of this QuizGroup.

        The amount of points allotted to each question in the group.  # noqa: E501

        :param question_points: The question_points of this QuizGroup.  # noqa: E501
        :type: int
        """

        self._question_points = question_points

    @property
    def assessment_question_bank_id(self):
        """Gets the assessment_question_bank_id of this QuizGroup.  # noqa: E501

        The ID of the Assessment question bank to pull questions from.  # noqa: E501

        :return: The assessment_question_bank_id of this QuizGroup.  # noqa: E501
        :rtype: int
        """
        return self._assessment_question_bank_id

    @assessment_question_bank_id.setter
    def assessment_question_bank_id(self, assessment_question_bank_id):
        """Sets the assessment_question_bank_id of this QuizGroup.

        The ID of the Assessment question bank to pull questions from.  # noqa: E501

        :param assessment_question_bank_id: The assessment_question_bank_id of this QuizGroup.  # noqa: E501
        :type: int
        """

        self._assessment_question_bank_id = assessment_question_bank_id

    @property
    def position(self):
        """Gets the position of this QuizGroup.  # noqa: E501

        The order in which the question group will be retrieved and displayed.  # noqa: E501

        :return: The position of this QuizGroup.  # noqa: E501
        :rtype: int
        """
        return self._position

    @position.setter
    def position(self, position):
        """Sets the position of this QuizGroup.

        The order in which the question group will be retrieved and displayed.  # noqa: E501

        :param position: The position of this QuizGroup.  # noqa: E501
        :type: int
        """

        self._position = position

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
        if issubclass(QuizGroup, dict):
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
        if not isinstance(other, QuizGroup):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuizGroup):
            return True

        return self.to_dict() != other.to_dict()
