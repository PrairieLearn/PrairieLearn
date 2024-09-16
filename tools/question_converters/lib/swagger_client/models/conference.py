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


class Conference(object):
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
        'conference_type': 'str',
        'conference_key': 'str',
        'description': 'str',
        'duration': 'int',
        'ended_at': 'ModelDatetime',
        'started_at': 'ModelDatetime',
        'title': 'str',
        'users': 'list[int]',
        'invitees': 'list[int]',
        'attendees': 'list[int]',
        'has_advanced_settings': 'bool',
        'long_running': 'bool',
        'user_settings': 'object',
        'recordings': 'list[ConferenceRecording]',
        'url': 'str',
        'join_url': 'str',
        'context_type': 'str',
        'context_id': 'int'
    }

    attribute_map = {
        'id': 'id',
        'conference_type': 'conference_type',
        'conference_key': 'conference_key',
        'description': 'description',
        'duration': 'duration',
        'ended_at': 'ended_at',
        'started_at': 'started_at',
        'title': 'title',
        'users': 'users',
        'invitees': 'invitees',
        'attendees': 'attendees',
        'has_advanced_settings': 'has_advanced_settings',
        'long_running': 'long_running',
        'user_settings': 'user_settings',
        'recordings': 'recordings',
        'url': 'url',
        'join_url': 'join_url',
        'context_type': 'context_type',
        'context_id': 'context_id'
    }

    def __init__(self, id=None, conference_type=None, conference_key=None, description=None, duration=None, ended_at=None, started_at=None, title=None, users=None, invitees=None, attendees=None, has_advanced_settings=None, long_running=None, user_settings=None, recordings=None, url=None, join_url=None, context_type=None, context_id=None, _configuration=None):  # noqa: E501
        """Conference - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._conference_type = None
        self._conference_key = None
        self._description = None
        self._duration = None
        self._ended_at = None
        self._started_at = None
        self._title = None
        self._users = None
        self._invitees = None
        self._attendees = None
        self._has_advanced_settings = None
        self._long_running = None
        self._user_settings = None
        self._recordings = None
        self._url = None
        self._join_url = None
        self._context_type = None
        self._context_id = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if conference_type is not None:
            self.conference_type = conference_type
        if conference_key is not None:
            self.conference_key = conference_key
        if description is not None:
            self.description = description
        if duration is not None:
            self.duration = duration
        if ended_at is not None:
            self.ended_at = ended_at
        if started_at is not None:
            self.started_at = started_at
        if title is not None:
            self.title = title
        if users is not None:
            self.users = users
        if invitees is not None:
            self.invitees = invitees
        if attendees is not None:
            self.attendees = attendees
        if has_advanced_settings is not None:
            self.has_advanced_settings = has_advanced_settings
        if long_running is not None:
            self.long_running = long_running
        if user_settings is not None:
            self.user_settings = user_settings
        if recordings is not None:
            self.recordings = recordings
        if url is not None:
            self.url = url
        if join_url is not None:
            self.join_url = join_url
        if context_type is not None:
            self.context_type = context_type
        if context_id is not None:
            self.context_id = context_id

    @property
    def id(self):
        """Gets the id of this Conference.  # noqa: E501

        The id of the conference  # noqa: E501

        :return: The id of this Conference.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this Conference.

        The id of the conference  # noqa: E501

        :param id: The id of this Conference.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def conference_type(self):
        """Gets the conference_type of this Conference.  # noqa: E501

        The type of conference  # noqa: E501

        :return: The conference_type of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._conference_type

    @conference_type.setter
    def conference_type(self, conference_type):
        """Sets the conference_type of this Conference.

        The type of conference  # noqa: E501

        :param conference_type: The conference_type of this Conference.  # noqa: E501
        :type: str
        """

        self._conference_type = conference_type

    @property
    def conference_key(self):
        """Gets the conference_key of this Conference.  # noqa: E501

        The 3rd party's ID for the conference  # noqa: E501

        :return: The conference_key of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._conference_key

    @conference_key.setter
    def conference_key(self, conference_key):
        """Sets the conference_key of this Conference.

        The 3rd party's ID for the conference  # noqa: E501

        :param conference_key: The conference_key of this Conference.  # noqa: E501
        :type: str
        """

        self._conference_key = conference_key

    @property
    def description(self):
        """Gets the description of this Conference.  # noqa: E501

        The description for the conference  # noqa: E501

        :return: The description of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._description

    @description.setter
    def description(self, description):
        """Sets the description of this Conference.

        The description for the conference  # noqa: E501

        :param description: The description of this Conference.  # noqa: E501
        :type: str
        """

        self._description = description

    @property
    def duration(self):
        """Gets the duration of this Conference.  # noqa: E501

        The expected duration the conference is supposed to last  # noqa: E501

        :return: The duration of this Conference.  # noqa: E501
        :rtype: int
        """
        return self._duration

    @duration.setter
    def duration(self, duration):
        """Sets the duration of this Conference.

        The expected duration the conference is supposed to last  # noqa: E501

        :param duration: The duration of this Conference.  # noqa: E501
        :type: int
        """

        self._duration = duration

    @property
    def ended_at(self):
        """Gets the ended_at of this Conference.  # noqa: E501

        The date that the conference ended at, null if it hasn't ended  # noqa: E501

        :return: The ended_at of this Conference.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._ended_at

    @ended_at.setter
    def ended_at(self, ended_at):
        """Sets the ended_at of this Conference.

        The date that the conference ended at, null if it hasn't ended  # noqa: E501

        :param ended_at: The ended_at of this Conference.  # noqa: E501
        :type: ModelDatetime
        """

        self._ended_at = ended_at

    @property
    def started_at(self):
        """Gets the started_at of this Conference.  # noqa: E501

        The date the conference started at, null if it hasn't started  # noqa: E501

        :return: The started_at of this Conference.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._started_at

    @started_at.setter
    def started_at(self, started_at):
        """Sets the started_at of this Conference.

        The date the conference started at, null if it hasn't started  # noqa: E501

        :param started_at: The started_at of this Conference.  # noqa: E501
        :type: ModelDatetime
        """

        self._started_at = started_at

    @property
    def title(self):
        """Gets the title of this Conference.  # noqa: E501

        The title of the conference  # noqa: E501

        :return: The title of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._title

    @title.setter
    def title(self, title):
        """Sets the title of this Conference.

        The title of the conference  # noqa: E501

        :param title: The title of this Conference.  # noqa: E501
        :type: str
        """

        self._title = title

    @property
    def users(self):
        """Gets the users of this Conference.  # noqa: E501

        Array of user ids that are participants in the conference  # noqa: E501

        :return: The users of this Conference.  # noqa: E501
        :rtype: list[int]
        """
        return self._users

    @users.setter
    def users(self, users):
        """Sets the users of this Conference.

        Array of user ids that are participants in the conference  # noqa: E501

        :param users: The users of this Conference.  # noqa: E501
        :type: list[int]
        """

        self._users = users

    @property
    def invitees(self):
        """Gets the invitees of this Conference.  # noqa: E501

        Array of user ids that are invitees in the conference  # noqa: E501

        :return: The invitees of this Conference.  # noqa: E501
        :rtype: list[int]
        """
        return self._invitees

    @invitees.setter
    def invitees(self, invitees):
        """Sets the invitees of this Conference.

        Array of user ids that are invitees in the conference  # noqa: E501

        :param invitees: The invitees of this Conference.  # noqa: E501
        :type: list[int]
        """

        self._invitees = invitees

    @property
    def attendees(self):
        """Gets the attendees of this Conference.  # noqa: E501

        Array of user ids that are attendees in the conference  # noqa: E501

        :return: The attendees of this Conference.  # noqa: E501
        :rtype: list[int]
        """
        return self._attendees

    @attendees.setter
    def attendees(self, attendees):
        """Sets the attendees of this Conference.

        Array of user ids that are attendees in the conference  # noqa: E501

        :param attendees: The attendees of this Conference.  # noqa: E501
        :type: list[int]
        """

        self._attendees = attendees

    @property
    def has_advanced_settings(self):
        """Gets the has_advanced_settings of this Conference.  # noqa: E501

        True if the conference type has advanced settings.  # noqa: E501

        :return: The has_advanced_settings of this Conference.  # noqa: E501
        :rtype: bool
        """
        return self._has_advanced_settings

    @has_advanced_settings.setter
    def has_advanced_settings(self, has_advanced_settings):
        """Sets the has_advanced_settings of this Conference.

        True if the conference type has advanced settings.  # noqa: E501

        :param has_advanced_settings: The has_advanced_settings of this Conference.  # noqa: E501
        :type: bool
        """

        self._has_advanced_settings = has_advanced_settings

    @property
    def long_running(self):
        """Gets the long_running of this Conference.  # noqa: E501

        If true the conference is long running and has no expected end time  # noqa: E501

        :return: The long_running of this Conference.  # noqa: E501
        :rtype: bool
        """
        return self._long_running

    @long_running.setter
    def long_running(self, long_running):
        """Sets the long_running of this Conference.

        If true the conference is long running and has no expected end time  # noqa: E501

        :param long_running: The long_running of this Conference.  # noqa: E501
        :type: bool
        """

        self._long_running = long_running

    @property
    def user_settings(self):
        """Gets the user_settings of this Conference.  # noqa: E501

        A collection of settings specific to the conference type  # noqa: E501

        :return: The user_settings of this Conference.  # noqa: E501
        :rtype: object
        """
        return self._user_settings

    @user_settings.setter
    def user_settings(self, user_settings):
        """Sets the user_settings of this Conference.

        A collection of settings specific to the conference type  # noqa: E501

        :param user_settings: The user_settings of this Conference.  # noqa: E501
        :type: object
        """

        self._user_settings = user_settings

    @property
    def recordings(self):
        """Gets the recordings of this Conference.  # noqa: E501

        A List of recordings for the conference  # noqa: E501

        :return: The recordings of this Conference.  # noqa: E501
        :rtype: list[ConferenceRecording]
        """
        return self._recordings

    @recordings.setter
    def recordings(self, recordings):
        """Sets the recordings of this Conference.

        A List of recordings for the conference  # noqa: E501

        :param recordings: The recordings of this Conference.  # noqa: E501
        :type: list[ConferenceRecording]
        """

        self._recordings = recordings

    @property
    def url(self):
        """Gets the url of this Conference.  # noqa: E501

        URL for the conference, may be null if the conference type doesn't set it  # noqa: E501

        :return: The url of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._url

    @url.setter
    def url(self, url):
        """Sets the url of this Conference.

        URL for the conference, may be null if the conference type doesn't set it  # noqa: E501

        :param url: The url of this Conference.  # noqa: E501
        :type: str
        """

        self._url = url

    @property
    def join_url(self):
        """Gets the join_url of this Conference.  # noqa: E501

        URL to join the conference, may be null if the conference type doesn't set it  # noqa: E501

        :return: The join_url of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._join_url

    @join_url.setter
    def join_url(self, join_url):
        """Sets the join_url of this Conference.

        URL to join the conference, may be null if the conference type doesn't set it  # noqa: E501

        :param join_url: The join_url of this Conference.  # noqa: E501
        :type: str
        """

        self._join_url = join_url

    @property
    def context_type(self):
        """Gets the context_type of this Conference.  # noqa: E501

        The type of this conference's context, typically 'Course' or 'Group'.  # noqa: E501

        :return: The context_type of this Conference.  # noqa: E501
        :rtype: str
        """
        return self._context_type

    @context_type.setter
    def context_type(self, context_type):
        """Sets the context_type of this Conference.

        The type of this conference's context, typically 'Course' or 'Group'.  # noqa: E501

        :param context_type: The context_type of this Conference.  # noqa: E501
        :type: str
        """

        self._context_type = context_type

    @property
    def context_id(self):
        """Gets the context_id of this Conference.  # noqa: E501

        The ID of this conference's context.  # noqa: E501

        :return: The context_id of this Conference.  # noqa: E501
        :rtype: int
        """
        return self._context_id

    @context_id.setter
    def context_id(self, context_id):
        """Sets the context_id of this Conference.

        The ID of this conference's context.  # noqa: E501

        :param context_id: The context_id of this Conference.  # noqa: E501
        :type: int
        """

        self._context_id = context_id

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
        if issubclass(Conference, dict):
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
        if not isinstance(other, Conference):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, Conference):
            return True

        return self.to_dict() != other.to_dict()
