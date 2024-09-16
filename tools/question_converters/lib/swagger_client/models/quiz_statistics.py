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


class QuizStatistics(object):
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
        'multiple_attempts_exist': 'bool',
        'includes_all_versions': 'bool',
        'generated_at': 'ModelDatetime',
        'url': 'str',
        'html_url': 'str',
        'question_statistics': 'QuizStatisticsQuestionStatistics',
        'submission_statistics': 'QuizStatisticsSubmissionStatistics',
        'links': 'QuizStatisticsLinks'
    }

    attribute_map = {
        'id': 'id',
        'quiz_id': 'quiz_id',
        'multiple_attempts_exist': 'multiple_attempts_exist',
        'includes_all_versions': 'includes_all_versions',
        'generated_at': 'generated_at',
        'url': 'url',
        'html_url': 'html_url',
        'question_statistics': 'question_statistics',
        'submission_statistics': 'submission_statistics',
        'links': 'links'
    }

    def __init__(self, id=None, quiz_id=None, multiple_attempts_exist=None, includes_all_versions=None, generated_at=None, url=None, html_url=None, question_statistics=None, submission_statistics=None, links=None, _configuration=None):  # noqa: E501
        """QuizStatistics - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._quiz_id = None
        self._multiple_attempts_exist = None
        self._includes_all_versions = None
        self._generated_at = None
        self._url = None
        self._html_url = None
        self._question_statistics = None
        self._submission_statistics = None
        self._links = None
        self.discriminator = None

        self.id = id
        self.quiz_id = quiz_id
        if multiple_attempts_exist is not None:
            self.multiple_attempts_exist = multiple_attempts_exist
        if includes_all_versions is not None:
            self.includes_all_versions = includes_all_versions
        if generated_at is not None:
            self.generated_at = generated_at
        if url is not None:
            self.url = url
        if html_url is not None:
            self.html_url = html_url
        if question_statistics is not None:
            self.question_statistics = question_statistics
        if submission_statistics is not None:
            self.submission_statistics = submission_statistics
        if links is not None:
            self.links = links

    @property
    def id(self):
        """Gets the id of this QuizStatistics.  # noqa: E501

        The ID of the quiz statistics report.  # noqa: E501

        :return: The id of this QuizStatistics.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this QuizStatistics.

        The ID of the quiz statistics report.  # noqa: E501

        :param id: The id of this QuizStatistics.  # noqa: E501
        :type: int
        """
        if self._configuration.client_side_validation and id is None:
            raise ValueError("Invalid value for `id`, must not be `None`")  # noqa: E501

        self._id = id

    @property
    def quiz_id(self):
        """Gets the quiz_id of this QuizStatistics.  # noqa: E501

        The ID of the Quiz the statistics report is for.  NOTE: AVAILABLE ONLY IN NON-JSON-API REQUESTS.  # noqa: E501

        :return: The quiz_id of this QuizStatistics.  # noqa: E501
        :rtype: int
        """
        return self._quiz_id

    @quiz_id.setter
    def quiz_id(self, quiz_id):
        """Sets the quiz_id of this QuizStatistics.

        The ID of the Quiz the statistics report is for.  NOTE: AVAILABLE ONLY IN NON-JSON-API REQUESTS.  # noqa: E501

        :param quiz_id: The quiz_id of this QuizStatistics.  # noqa: E501
        :type: int
        """
        if self._configuration.client_side_validation and quiz_id is None:
            raise ValueError("Invalid value for `quiz_id`, must not be `None`")  # noqa: E501

        self._quiz_id = quiz_id

    @property
    def multiple_attempts_exist(self):
        """Gets the multiple_attempts_exist of this QuizStatistics.  # noqa: E501

        Whether there are any students that have made mutliple submissions for this quiz.  # noqa: E501

        :return: The multiple_attempts_exist of this QuizStatistics.  # noqa: E501
        :rtype: bool
        """
        return self._multiple_attempts_exist

    @multiple_attempts_exist.setter
    def multiple_attempts_exist(self, multiple_attempts_exist):
        """Sets the multiple_attempts_exist of this QuizStatistics.

        Whether there are any students that have made mutliple submissions for this quiz.  # noqa: E501

        :param multiple_attempts_exist: The multiple_attempts_exist of this QuizStatistics.  # noqa: E501
        :type: bool
        """

        self._multiple_attempts_exist = multiple_attempts_exist

    @property
    def includes_all_versions(self):
        """Gets the includes_all_versions of this QuizStatistics.  # noqa: E501

        In the presence of multiple attempts, this field describes whether the statistics describe all the submission attempts and not only the latest ones.  # noqa: E501

        :return: The includes_all_versions of this QuizStatistics.  # noqa: E501
        :rtype: bool
        """
        return self._includes_all_versions

    @includes_all_versions.setter
    def includes_all_versions(self, includes_all_versions):
        """Sets the includes_all_versions of this QuizStatistics.

        In the presence of multiple attempts, this field describes whether the statistics describe all the submission attempts and not only the latest ones.  # noqa: E501

        :param includes_all_versions: The includes_all_versions of this QuizStatistics.  # noqa: E501
        :type: bool
        """

        self._includes_all_versions = includes_all_versions

    @property
    def generated_at(self):
        """Gets the generated_at of this QuizStatistics.  # noqa: E501

        The time at which the statistics were generated, which is usually after the occurrence of a quiz event, like a student submitting it.  # noqa: E501

        :return: The generated_at of this QuizStatistics.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._generated_at

    @generated_at.setter
    def generated_at(self, generated_at):
        """Sets the generated_at of this QuizStatistics.

        The time at which the statistics were generated, which is usually after the occurrence of a quiz event, like a student submitting it.  # noqa: E501

        :param generated_at: The generated_at of this QuizStatistics.  # noqa: E501
        :type: ModelDatetime
        """

        self._generated_at = generated_at

    @property
    def url(self):
        """Gets the url of this QuizStatistics.  # noqa: E501

        The API HTTP/HTTPS URL to this quiz statistics.  # noqa: E501

        :return: The url of this QuizStatistics.  # noqa: E501
        :rtype: str
        """
        return self._url

    @url.setter
    def url(self, url):
        """Sets the url of this QuizStatistics.

        The API HTTP/HTTPS URL to this quiz statistics.  # noqa: E501

        :param url: The url of this QuizStatistics.  # noqa: E501
        :type: str
        """

        self._url = url

    @property
    def html_url(self):
        """Gets the html_url of this QuizStatistics.  # noqa: E501

        The HTTP/HTTPS URL to the page where the statistics can be seen visually.  # noqa: E501

        :return: The html_url of this QuizStatistics.  # noqa: E501
        :rtype: str
        """
        return self._html_url

    @html_url.setter
    def html_url(self, html_url):
        """Sets the html_url of this QuizStatistics.

        The HTTP/HTTPS URL to the page where the statistics can be seen visually.  # noqa: E501

        :param html_url: The html_url of this QuizStatistics.  # noqa: E501
        :type: str
        """

        self._html_url = html_url

    @property
    def question_statistics(self):
        """Gets the question_statistics of this QuizStatistics.  # noqa: E501

        Question-specific statistics for each question and its answers.  # noqa: E501

        :return: The question_statistics of this QuizStatistics.  # noqa: E501
        :rtype: QuizStatisticsQuestionStatistics
        """
        return self._question_statistics

    @question_statistics.setter
    def question_statistics(self, question_statistics):
        """Sets the question_statistics of this QuizStatistics.

        Question-specific statistics for each question and its answers.  # noqa: E501

        :param question_statistics: The question_statistics of this QuizStatistics.  # noqa: E501
        :type: QuizStatisticsQuestionStatistics
        """

        self._question_statistics = question_statistics

    @property
    def submission_statistics(self):
        """Gets the submission_statistics of this QuizStatistics.  # noqa: E501

        Question-specific statistics for each question and its answers.  # noqa: E501

        :return: The submission_statistics of this QuizStatistics.  # noqa: E501
        :rtype: QuizStatisticsSubmissionStatistics
        """
        return self._submission_statistics

    @submission_statistics.setter
    def submission_statistics(self, submission_statistics):
        """Sets the submission_statistics of this QuizStatistics.

        Question-specific statistics for each question and its answers.  # noqa: E501

        :param submission_statistics: The submission_statistics of this QuizStatistics.  # noqa: E501
        :type: QuizStatisticsSubmissionStatistics
        """

        self._submission_statistics = submission_statistics

    @property
    def links(self):
        """Gets the links of this QuizStatistics.  # noqa: E501

        JSON-API construct that contains links to media related to this quiz statistics object.  NOTE: AVAILABLE ONLY IN JSON-API REQUESTS.  # noqa: E501

        :return: The links of this QuizStatistics.  # noqa: E501
        :rtype: QuizStatisticsLinks
        """
        return self._links

    @links.setter
    def links(self, links):
        """Sets the links of this QuizStatistics.

        JSON-API construct that contains links to media related to this quiz statistics object.  NOTE: AVAILABLE ONLY IN JSON-API REQUESTS.  # noqa: E501

        :param links: The links of this QuizStatistics.  # noqa: E501
        :type: QuizStatisticsLinks
        """

        self._links = links

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
        if issubclass(QuizStatistics, dict):
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
        if not isinstance(other, QuizStatistics):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuizStatistics):
            return True

        return self.to_dict() != other.to_dict()
