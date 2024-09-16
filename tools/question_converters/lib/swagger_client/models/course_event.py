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


class CourseEvent(object):
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
        'id': 'str',
        'created_at': 'ModelDatetime',
        'event_type': 'str',
        'event_data': 'str',
        'event_source': 'str',
        'links': 'CourseEventLink'
    }

    attribute_map = {
        'id': 'id',
        'created_at': 'created_at',
        'event_type': 'event_type',
        'event_data': 'event_data',
        'event_source': 'event_source',
        'links': 'links'
    }

    def __init__(self, id=None, created_at=None, event_type=None, event_data=None, event_source=None, links=None, _configuration=None):  # noqa: E501
        """CourseEvent - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._created_at = None
        self._event_type = None
        self._event_data = None
        self._event_source = None
        self._links = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if created_at is not None:
            self.created_at = created_at
        if event_type is not None:
            self.event_type = event_type
        if event_data is not None:
            self.event_data = event_data
        if event_source is not None:
            self.event_source = event_source
        if links is not None:
            self.links = links

    @property
    def id(self):
        """Gets the id of this CourseEvent.  # noqa: E501

        ID of the event.  # noqa: E501

        :return: The id of this CourseEvent.  # noqa: E501
        :rtype: str
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this CourseEvent.

        ID of the event.  # noqa: E501

        :param id: The id of this CourseEvent.  # noqa: E501
        :type: str
        """

        self._id = id

    @property
    def created_at(self):
        """Gets the created_at of this CourseEvent.  # noqa: E501

        timestamp of the event  # noqa: E501

        :return: The created_at of this CourseEvent.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._created_at

    @created_at.setter
    def created_at(self, created_at):
        """Sets the created_at of this CourseEvent.

        timestamp of the event  # noqa: E501

        :param created_at: The created_at of this CourseEvent.  # noqa: E501
        :type: ModelDatetime
        """

        self._created_at = created_at

    @property
    def event_type(self):
        """Gets the event_type of this CourseEvent.  # noqa: E501

        Course event type The event type defines the type and schema of the event_data object.  # noqa: E501

        :return: The event_type of this CourseEvent.  # noqa: E501
        :rtype: str
        """
        return self._event_type

    @event_type.setter
    def event_type(self, event_type):
        """Sets the event_type of this CourseEvent.

        Course event type The event type defines the type and schema of the event_data object.  # noqa: E501

        :param event_type: The event_type of this CourseEvent.  # noqa: E501
        :type: str
        """

        self._event_type = event_type

    @property
    def event_data(self):
        """Gets the event_data of this CourseEvent.  # noqa: E501

        Course event data depending on the event type.  This will return an object containing the relevant event data.  An updated event type will return an UpdatedEventData object.  # noqa: E501

        :return: The event_data of this CourseEvent.  # noqa: E501
        :rtype: str
        """
        return self._event_data

    @event_data.setter
    def event_data(self, event_data):
        """Sets the event_data of this CourseEvent.

        Course event data depending on the event type.  This will return an object containing the relevant event data.  An updated event type will return an UpdatedEventData object.  # noqa: E501

        :param event_data: The event_data of this CourseEvent.  # noqa: E501
        :type: str
        """

        self._event_data = event_data

    @property
    def event_source(self):
        """Gets the event_source of this CourseEvent.  # noqa: E501

        Course event source depending on the event type.  This will return a string containing the source of the event.  # noqa: E501

        :return: The event_source of this CourseEvent.  # noqa: E501
        :rtype: str
        """
        return self._event_source

    @event_source.setter
    def event_source(self, event_source):
        """Sets the event_source of this CourseEvent.

        Course event source depending on the event type.  This will return a string containing the source of the event.  # noqa: E501

        :param event_source: The event_source of this CourseEvent.  # noqa: E501
        :type: str
        """

        self._event_source = event_source

    @property
    def links(self):
        """Gets the links of this CourseEvent.  # noqa: E501

        Jsonapi.org links  # noqa: E501

        :return: The links of this CourseEvent.  # noqa: E501
        :rtype: CourseEventLink
        """
        return self._links

    @links.setter
    def links(self, links):
        """Sets the links of this CourseEvent.

        Jsonapi.org links  # noqa: E501

        :param links: The links of this CourseEvent.  # noqa: E501
        :type: CourseEventLink
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
        if issubclass(CourseEvent, dict):
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
        if not isinstance(other, CourseEvent):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, CourseEvent):
            return True

        return self.to_dict() != other.to_dict()
