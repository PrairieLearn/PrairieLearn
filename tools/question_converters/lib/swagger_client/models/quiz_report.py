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


class QuizReport(object):
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
        'report_type': 'str',
        'readable_type': 'str',
        'includes_all_versions': 'bool',
        'anonymous': 'bool',
        'generatable': 'bool',
        'created_at': 'ModelDatetime',
        'updated_at': 'ModelDatetime',
        'url': 'str',
        'file': 'File',
        'progress_url': 'str',
        'progress': 'Progress'
    }

    attribute_map = {
        'id': 'id',
        'quiz_id': 'quiz_id',
        'report_type': 'report_type',
        'readable_type': 'readable_type',
        'includes_all_versions': 'includes_all_versions',
        'anonymous': 'anonymous',
        'generatable': 'generatable',
        'created_at': 'created_at',
        'updated_at': 'updated_at',
        'url': 'url',
        'file': 'file',
        'progress_url': 'progress_url',
        'progress': 'progress'
    }

    def __init__(self, id=None, quiz_id=None, report_type=None, readable_type=None, includes_all_versions=None, anonymous=None, generatable=None, created_at=None, updated_at=None, url=None, file=None, progress_url=None, progress=None, _configuration=None):  # noqa: E501
        """QuizReport - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._quiz_id = None
        self._report_type = None
        self._readable_type = None
        self._includes_all_versions = None
        self._anonymous = None
        self._generatable = None
        self._created_at = None
        self._updated_at = None
        self._url = None
        self._file = None
        self._progress_url = None
        self._progress = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if quiz_id is not None:
            self.quiz_id = quiz_id
        if report_type is not None:
            self.report_type = report_type
        if readable_type is not None:
            self.readable_type = readable_type
        if includes_all_versions is not None:
            self.includes_all_versions = includes_all_versions
        if anonymous is not None:
            self.anonymous = anonymous
        if generatable is not None:
            self.generatable = generatable
        if created_at is not None:
            self.created_at = created_at
        if updated_at is not None:
            self.updated_at = updated_at
        if url is not None:
            self.url = url
        if file is not None:
            self.file = file
        if progress_url is not None:
            self.progress_url = progress_url
        if progress is not None:
            self.progress = progress

    @property
    def id(self):
        """Gets the id of this QuizReport.  # noqa: E501

        the ID of the quiz report  # noqa: E501

        :return: The id of this QuizReport.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this QuizReport.

        the ID of the quiz report  # noqa: E501

        :param id: The id of this QuizReport.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def quiz_id(self):
        """Gets the quiz_id of this QuizReport.  # noqa: E501

        the ID of the quiz  # noqa: E501

        :return: The quiz_id of this QuizReport.  # noqa: E501
        :rtype: int
        """
        return self._quiz_id

    @quiz_id.setter
    def quiz_id(self, quiz_id):
        """Sets the quiz_id of this QuizReport.

        the ID of the quiz  # noqa: E501

        :param quiz_id: The quiz_id of this QuizReport.  # noqa: E501
        :type: int
        """

        self._quiz_id = quiz_id

    @property
    def report_type(self):
        """Gets the report_type of this QuizReport.  # noqa: E501

        which type of report this is possible values: 'student_analysis', 'item_analysis'  # noqa: E501

        :return: The report_type of this QuizReport.  # noqa: E501
        :rtype: str
        """
        return self._report_type

    @report_type.setter
    def report_type(self, report_type):
        """Sets the report_type of this QuizReport.

        which type of report this is possible values: 'student_analysis', 'item_analysis'  # noqa: E501

        :param report_type: The report_type of this QuizReport.  # noqa: E501
        :type: str
        """

        self._report_type = report_type

    @property
    def readable_type(self):
        """Gets the readable_type of this QuizReport.  # noqa: E501

        a human-readable (and localized) version of the report_type  # noqa: E501

        :return: The readable_type of this QuizReport.  # noqa: E501
        :rtype: str
        """
        return self._readable_type

    @readable_type.setter
    def readable_type(self, readable_type):
        """Sets the readable_type of this QuizReport.

        a human-readable (and localized) version of the report_type  # noqa: E501

        :param readable_type: The readable_type of this QuizReport.  # noqa: E501
        :type: str
        """

        self._readable_type = readable_type

    @property
    def includes_all_versions(self):
        """Gets the includes_all_versions of this QuizReport.  # noqa: E501

        boolean indicating whether the report represents all submissions or only the most recent ones for each student  # noqa: E501

        :return: The includes_all_versions of this QuizReport.  # noqa: E501
        :rtype: bool
        """
        return self._includes_all_versions

    @includes_all_versions.setter
    def includes_all_versions(self, includes_all_versions):
        """Sets the includes_all_versions of this QuizReport.

        boolean indicating whether the report represents all submissions or only the most recent ones for each student  # noqa: E501

        :param includes_all_versions: The includes_all_versions of this QuizReport.  # noqa: E501
        :type: bool
        """

        self._includes_all_versions = includes_all_versions

    @property
    def anonymous(self):
        """Gets the anonymous of this QuizReport.  # noqa: E501

        boolean indicating whether the report is for an anonymous survey. if true, no student names will be included in the csv  # noqa: E501

        :return: The anonymous of this QuizReport.  # noqa: E501
        :rtype: bool
        """
        return self._anonymous

    @anonymous.setter
    def anonymous(self, anonymous):
        """Sets the anonymous of this QuizReport.

        boolean indicating whether the report is for an anonymous survey. if true, no student names will be included in the csv  # noqa: E501

        :param anonymous: The anonymous of this QuizReport.  # noqa: E501
        :type: bool
        """

        self._anonymous = anonymous

    @property
    def generatable(self):
        """Gets the generatable of this QuizReport.  # noqa: E501

        boolean indicating whether the report can be generated, which is true unless the quiz is a survey one  # noqa: E501

        :return: The generatable of this QuizReport.  # noqa: E501
        :rtype: bool
        """
        return self._generatable

    @generatable.setter
    def generatable(self, generatable):
        """Sets the generatable of this QuizReport.

        boolean indicating whether the report can be generated, which is true unless the quiz is a survey one  # noqa: E501

        :param generatable: The generatable of this QuizReport.  # noqa: E501
        :type: bool
        """

        self._generatable = generatable

    @property
    def created_at(self):
        """Gets the created_at of this QuizReport.  # noqa: E501

        when the report was created  # noqa: E501

        :return: The created_at of this QuizReport.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._created_at

    @created_at.setter
    def created_at(self, created_at):
        """Sets the created_at of this QuizReport.

        when the report was created  # noqa: E501

        :param created_at: The created_at of this QuizReport.  # noqa: E501
        :type: ModelDatetime
        """

        self._created_at = created_at

    @property
    def updated_at(self):
        """Gets the updated_at of this QuizReport.  # noqa: E501

        when the report was last updated  # noqa: E501

        :return: The updated_at of this QuizReport.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._updated_at

    @updated_at.setter
    def updated_at(self, updated_at):
        """Sets the updated_at of this QuizReport.

        when the report was last updated  # noqa: E501

        :param updated_at: The updated_at of this QuizReport.  # noqa: E501
        :type: ModelDatetime
        """

        self._updated_at = updated_at

    @property
    def url(self):
        """Gets the url of this QuizReport.  # noqa: E501

        the API endpoint for this report  # noqa: E501

        :return: The url of this QuizReport.  # noqa: E501
        :rtype: str
        """
        return self._url

    @url.setter
    def url(self, url):
        """Sets the url of this QuizReport.

        the API endpoint for this report  # noqa: E501

        :param url: The url of this QuizReport.  # noqa: E501
        :type: str
        """

        self._url = url

    @property
    def file(self):
        """Gets the file of this QuizReport.  # noqa: E501

        if the report has finished generating, a File object that represents it. refer to the Files API for more information about the format  # noqa: E501

        :return: The file of this QuizReport.  # noqa: E501
        :rtype: File
        """
        return self._file

    @file.setter
    def file(self, file):
        """Sets the file of this QuizReport.

        if the report has finished generating, a File object that represents it. refer to the Files API for more information about the format  # noqa: E501

        :param file: The file of this QuizReport.  # noqa: E501
        :type: File
        """

        self._file = file

    @property
    def progress_url(self):
        """Gets the progress_url of this QuizReport.  # noqa: E501

        if the report has not yet finished generating, a URL where information about its progress can be retrieved. refer to the Progress API for more information (Note: not available in JSON-API format)  # noqa: E501

        :return: The progress_url of this QuizReport.  # noqa: E501
        :rtype: str
        """
        return self._progress_url

    @progress_url.setter
    def progress_url(self, progress_url):
        """Sets the progress_url of this QuizReport.

        if the report has not yet finished generating, a URL where information about its progress can be retrieved. refer to the Progress API for more information (Note: not available in JSON-API format)  # noqa: E501

        :param progress_url: The progress_url of this QuizReport.  # noqa: E501
        :type: str
        """

        self._progress_url = progress_url

    @property
    def progress(self):
        """Gets the progress of this QuizReport.  # noqa: E501

        if the report is being generated, a Progress object that represents the operation. Refer to the Progress API for more information about the format. (Note: available only in JSON-API format)  # noqa: E501

        :return: The progress of this QuizReport.  # noqa: E501
        :rtype: Progress
        """
        return self._progress

    @progress.setter
    def progress(self, progress):
        """Sets the progress of this QuizReport.

        if the report is being generated, a Progress object that represents the operation. Refer to the Progress API for more information about the format. (Note: available only in JSON-API format)  # noqa: E501

        :param progress: The progress of this QuizReport.  # noqa: E501
        :type: Progress
        """

        self._progress = progress

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
        if issubclass(QuizReport, dict):
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
        if not isinstance(other, QuizReport):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, QuizReport):
            return True

        return self.to_dict() != other.to_dict()
