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


class Appointment(object):
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
        'start_at': 'ModelDatetime',
        'end_at': 'ModelDatetime'
    }

    attribute_map = {
        'id': 'id',
        'start_at': 'start_at',
        'end_at': 'end_at'
    }

    def __init__(self, id=None, start_at=None, end_at=None, _configuration=None):  # noqa: E501
        """Appointment - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._start_at = None
        self._end_at = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if start_at is not None:
            self.start_at = start_at
        if end_at is not None:
            self.end_at = end_at

    @property
    def id(self):
        """Gets the id of this Appointment.  # noqa: E501

        The appointment identifier.  # noqa: E501

        :return: The id of this Appointment.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this Appointment.

        The appointment identifier.  # noqa: E501

        :param id: The id of this Appointment.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def start_at(self):
        """Gets the start_at of this Appointment.  # noqa: E501

        Start time for the appointment  # noqa: E501

        :return: The start_at of this Appointment.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._start_at

    @start_at.setter
    def start_at(self, start_at):
        """Sets the start_at of this Appointment.

        Start time for the appointment  # noqa: E501

        :param start_at: The start_at of this Appointment.  # noqa: E501
        :type: ModelDatetime
        """

        self._start_at = start_at

    @property
    def end_at(self):
        """Gets the end_at of this Appointment.  # noqa: E501

        End time for the appointment  # noqa: E501

        :return: The end_at of this Appointment.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._end_at

    @end_at.setter
    def end_at(self, end_at):
        """Sets the end_at of this Appointment.

        End time for the appointment  # noqa: E501

        :param end_at: The end_at of this Appointment.  # noqa: E501
        :type: ModelDatetime
        """

        self._end_at = end_at

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
        if issubclass(Appointment, dict):
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
        if not isinstance(other, Appointment):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, Appointment):
            return True

        return self.to_dict() != other.to_dict()
