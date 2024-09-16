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


class BlueprintTemplate(object):
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
        'course_id': 'int',
        'last_export_completed_at': 'ModelDatetime',
        'associated_course_count': 'int',
        'latest_migration': 'BlueprintMigration'
    }

    attribute_map = {
        'id': 'id',
        'course_id': 'course_id',
        'last_export_completed_at': 'last_export_completed_at',
        'associated_course_count': 'associated_course_count',
        'latest_migration': 'latest_migration'
    }

    def __init__(self, id=None, course_id=None, last_export_completed_at=None, associated_course_count=None, latest_migration=None, _configuration=None):  # noqa: E501
        """BlueprintTemplate - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._course_id = None
        self._last_export_completed_at = None
        self._associated_course_count = None
        self._latest_migration = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if course_id is not None:
            self.course_id = course_id
        if last_export_completed_at is not None:
            self.last_export_completed_at = last_export_completed_at
        if associated_course_count is not None:
            self.associated_course_count = associated_course_count
        if latest_migration is not None:
            self.latest_migration = latest_migration

    @property
    def id(self):
        """Gets the id of this BlueprintTemplate.  # noqa: E501

        The ID of the template.  # noqa: E501

        :return: The id of this BlueprintTemplate.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this BlueprintTemplate.

        The ID of the template.  # noqa: E501

        :param id: The id of this BlueprintTemplate.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def course_id(self):
        """Gets the course_id of this BlueprintTemplate.  # noqa: E501

        The ID of the Course the template belongs to.  # noqa: E501

        :return: The course_id of this BlueprintTemplate.  # noqa: E501
        :rtype: int
        """
        return self._course_id

    @course_id.setter
    def course_id(self, course_id):
        """Sets the course_id of this BlueprintTemplate.

        The ID of the Course the template belongs to.  # noqa: E501

        :param course_id: The course_id of this BlueprintTemplate.  # noqa: E501
        :type: int
        """

        self._course_id = course_id

    @property
    def last_export_completed_at(self):
        """Gets the last_export_completed_at of this BlueprintTemplate.  # noqa: E501

        Time when the last export was completed  # noqa: E501

        :return: The last_export_completed_at of this BlueprintTemplate.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._last_export_completed_at

    @last_export_completed_at.setter
    def last_export_completed_at(self, last_export_completed_at):
        """Sets the last_export_completed_at of this BlueprintTemplate.

        Time when the last export was completed  # noqa: E501

        :param last_export_completed_at: The last_export_completed_at of this BlueprintTemplate.  # noqa: E501
        :type: ModelDatetime
        """

        self._last_export_completed_at = last_export_completed_at

    @property
    def associated_course_count(self):
        """Gets the associated_course_count of this BlueprintTemplate.  # noqa: E501

        Number of associated courses for the template  # noqa: E501

        :return: The associated_course_count of this BlueprintTemplate.  # noqa: E501
        :rtype: int
        """
        return self._associated_course_count

    @associated_course_count.setter
    def associated_course_count(self, associated_course_count):
        """Sets the associated_course_count of this BlueprintTemplate.

        Number of associated courses for the template  # noqa: E501

        :param associated_course_count: The associated_course_count of this BlueprintTemplate.  # noqa: E501
        :type: int
        """

        self._associated_course_count = associated_course_count

    @property
    def latest_migration(self):
        """Gets the latest_migration of this BlueprintTemplate.  # noqa: E501

        Details of the latest migration  # noqa: E501

        :return: The latest_migration of this BlueprintTemplate.  # noqa: E501
        :rtype: BlueprintMigration
        """
        return self._latest_migration

    @latest_migration.setter
    def latest_migration(self, latest_migration):
        """Sets the latest_migration of this BlueprintTemplate.

        Details of the latest migration  # noqa: E501

        :param latest_migration: The latest_migration of this BlueprintTemplate.  # noqa: E501
        :type: BlueprintMigration
        """

        self._latest_migration = latest_migration

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
        if issubclass(BlueprintTemplate, dict):
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
        if not isinstance(other, BlueprintTemplate):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, BlueprintTemplate):
            return True

        return self.to_dict() != other.to_dict()
