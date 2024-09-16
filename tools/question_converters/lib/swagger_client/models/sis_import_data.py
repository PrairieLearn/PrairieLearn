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


class SisImportData(object):
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
        'import_type': 'str',
        'supplied_batches': 'list[str]',
        'counts': 'SisImportCounts'
    }

    attribute_map = {
        'import_type': 'import_type',
        'supplied_batches': 'supplied_batches',
        'counts': 'counts'
    }

    def __init__(self, import_type=None, supplied_batches=None, counts=None, _configuration=None):  # noqa: E501
        """SisImportData - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._import_type = None
        self._supplied_batches = None
        self._counts = None
        self.discriminator = None

        if import_type is not None:
            self.import_type = import_type
        if supplied_batches is not None:
            self.supplied_batches = supplied_batches
        if counts is not None:
            self.counts = counts

    @property
    def import_type(self):
        """Gets the import_type of this SisImportData.  # noqa: E501

        The type of SIS import  # noqa: E501

        :return: The import_type of this SisImportData.  # noqa: E501
        :rtype: str
        """
        return self._import_type

    @import_type.setter
    def import_type(self, import_type):
        """Sets the import_type of this SisImportData.

        The type of SIS import  # noqa: E501

        :param import_type: The import_type of this SisImportData.  # noqa: E501
        :type: str
        """

        self._import_type = import_type

    @property
    def supplied_batches(self):
        """Gets the supplied_batches of this SisImportData.  # noqa: E501

        Which files were included in the SIS import  # noqa: E501

        :return: The supplied_batches of this SisImportData.  # noqa: E501
        :rtype: list[str]
        """
        return self._supplied_batches

    @supplied_batches.setter
    def supplied_batches(self, supplied_batches):
        """Sets the supplied_batches of this SisImportData.

        Which files were included in the SIS import  # noqa: E501

        :param supplied_batches: The supplied_batches of this SisImportData.  # noqa: E501
        :type: list[str]
        """

        self._supplied_batches = supplied_batches

    @property
    def counts(self):
        """Gets the counts of this SisImportData.  # noqa: E501

        The number of rows processed for each type of import  # noqa: E501

        :return: The counts of this SisImportData.  # noqa: E501
        :rtype: SisImportCounts
        """
        return self._counts

    @counts.setter
    def counts(self, counts):
        """Sets the counts of this SisImportData.

        The number of rows processed for each type of import  # noqa: E501

        :param counts: The counts of this SisImportData.  # noqa: E501
        :type: SisImportCounts
        """

        self._counts = counts

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
        if issubclass(SisImportData, dict):
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
        if not isinstance(other, SisImportData):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, SisImportData):
            return True

        return self.to_dict() != other.to_dict()
