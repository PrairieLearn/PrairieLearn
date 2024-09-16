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


class NeedsGradingCount(object):
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
        'section_id': 'str',
        'needs_grading_count': 'int'
    }

    attribute_map = {
        'section_id': 'section_id',
        'needs_grading_count': 'needs_grading_count'
    }

    def __init__(self, section_id=None, needs_grading_count=None, _configuration=None):  # noqa: E501
        """NeedsGradingCount - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._section_id = None
        self._needs_grading_count = None
        self.discriminator = None

        if section_id is not None:
            self.section_id = section_id
        if needs_grading_count is not None:
            self.needs_grading_count = needs_grading_count

    @property
    def section_id(self):
        """Gets the section_id of this NeedsGradingCount.  # noqa: E501

        The section ID  # noqa: E501

        :return: The section_id of this NeedsGradingCount.  # noqa: E501
        :rtype: str
        """
        return self._section_id

    @section_id.setter
    def section_id(self, section_id):
        """Sets the section_id of this NeedsGradingCount.

        The section ID  # noqa: E501

        :param section_id: The section_id of this NeedsGradingCount.  # noqa: E501
        :type: str
        """

        self._section_id = section_id

    @property
    def needs_grading_count(self):
        """Gets the needs_grading_count of this NeedsGradingCount.  # noqa: E501

        Number of submissions that need grading  # noqa: E501

        :return: The needs_grading_count of this NeedsGradingCount.  # noqa: E501
        :rtype: int
        """
        return self._needs_grading_count

    @needs_grading_count.setter
    def needs_grading_count(self, needs_grading_count):
        """Sets the needs_grading_count of this NeedsGradingCount.

        Number of submissions that need grading  # noqa: E501

        :param needs_grading_count: The needs_grading_count of this NeedsGradingCount.  # noqa: E501
        :type: int
        """

        self._needs_grading_count = needs_grading_count

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
        if issubclass(NeedsGradingCount, dict):
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
        if not isinstance(other, NeedsGradingCount):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, NeedsGradingCount):
            return True

        return self.to_dict() != other.to_dict()
