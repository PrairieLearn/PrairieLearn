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


class Collaboration(object):
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
        'collaboration_type': 'str',
        'document_id': 'str',
        'user_id': 'int',
        'context_id': 'int',
        'context_type': 'str',
        'url': 'str',
        'created_at': 'ModelDatetime',
        'updated_at': 'ModelDatetime',
        'description': 'str',
        'title': 'str',
        'type': 'str',
        'update_url': 'str',
        'user_name': 'str'
    }

    attribute_map = {
        'id': 'id',
        'collaboration_type': 'collaboration_type',
        'document_id': 'document_id',
        'user_id': 'user_id',
        'context_id': 'context_id',
        'context_type': 'context_type',
        'url': 'url',
        'created_at': 'created_at',
        'updated_at': 'updated_at',
        'description': 'description',
        'title': 'title',
        'type': 'type',
        'update_url': 'update_url',
        'user_name': 'user_name'
    }

    def __init__(self, id=None, collaboration_type=None, document_id=None, user_id=None, context_id=None, context_type=None, url=None, created_at=None, updated_at=None, description=None, title=None, type=None, update_url=None, user_name=None, _configuration=None):  # noqa: E501
        """Collaboration - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._collaboration_type = None
        self._document_id = None
        self._user_id = None
        self._context_id = None
        self._context_type = None
        self._url = None
        self._created_at = None
        self._updated_at = None
        self._description = None
        self._title = None
        self._type = None
        self._update_url = None
        self._user_name = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if collaboration_type is not None:
            self.collaboration_type = collaboration_type
        if document_id is not None:
            self.document_id = document_id
        if user_id is not None:
            self.user_id = user_id
        if context_id is not None:
            self.context_id = context_id
        if context_type is not None:
            self.context_type = context_type
        if url is not None:
            self.url = url
        if created_at is not None:
            self.created_at = created_at
        if updated_at is not None:
            self.updated_at = updated_at
        if description is not None:
            self.description = description
        if title is not None:
            self.title = title
        if type is not None:
            self.type = type
        if update_url is not None:
            self.update_url = update_url
        if user_name is not None:
            self.user_name = user_name

    @property
    def id(self):
        """Gets the id of this Collaboration.  # noqa: E501

        The unique identifier for the collaboration  # noqa: E501

        :return: The id of this Collaboration.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this Collaboration.

        The unique identifier for the collaboration  # noqa: E501

        :param id: The id of this Collaboration.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def collaboration_type(self):
        """Gets the collaboration_type of this Collaboration.  # noqa: E501

        A name for the type of collaboration  # noqa: E501

        :return: The collaboration_type of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._collaboration_type

    @collaboration_type.setter
    def collaboration_type(self, collaboration_type):
        """Sets the collaboration_type of this Collaboration.

        A name for the type of collaboration  # noqa: E501

        :param collaboration_type: The collaboration_type of this Collaboration.  # noqa: E501
        :type: str
        """

        self._collaboration_type = collaboration_type

    @property
    def document_id(self):
        """Gets the document_id of this Collaboration.  # noqa: E501

        The collaboration document identifier for the collaboration provider  # noqa: E501

        :return: The document_id of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._document_id

    @document_id.setter
    def document_id(self, document_id):
        """Sets the document_id of this Collaboration.

        The collaboration document identifier for the collaboration provider  # noqa: E501

        :param document_id: The document_id of this Collaboration.  # noqa: E501
        :type: str
        """

        self._document_id = document_id

    @property
    def user_id(self):
        """Gets the user_id of this Collaboration.  # noqa: E501

        The canvas id of the user who created the collaboration  # noqa: E501

        :return: The user_id of this Collaboration.  # noqa: E501
        :rtype: int
        """
        return self._user_id

    @user_id.setter
    def user_id(self, user_id):
        """Sets the user_id of this Collaboration.

        The canvas id of the user who created the collaboration  # noqa: E501

        :param user_id: The user_id of this Collaboration.  # noqa: E501
        :type: int
        """

        self._user_id = user_id

    @property
    def context_id(self):
        """Gets the context_id of this Collaboration.  # noqa: E501

        The canvas id of the course or group to which the collaboration belongs  # noqa: E501

        :return: The context_id of this Collaboration.  # noqa: E501
        :rtype: int
        """
        return self._context_id

    @context_id.setter
    def context_id(self, context_id):
        """Sets the context_id of this Collaboration.

        The canvas id of the course or group to which the collaboration belongs  # noqa: E501

        :param context_id: The context_id of this Collaboration.  # noqa: E501
        :type: int
        """

        self._context_id = context_id

    @property
    def context_type(self):
        """Gets the context_type of this Collaboration.  # noqa: E501

        The canvas type of the course or group to which the collaboration belongs  # noqa: E501

        :return: The context_type of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._context_type

    @context_type.setter
    def context_type(self, context_type):
        """Sets the context_type of this Collaboration.

        The canvas type of the course or group to which the collaboration belongs  # noqa: E501

        :param context_type: The context_type of this Collaboration.  # noqa: E501
        :type: str
        """

        self._context_type = context_type

    @property
    def url(self):
        """Gets the url of this Collaboration.  # noqa: E501

        The LTI launch url to view collaboration.  # noqa: E501

        :return: The url of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._url

    @url.setter
    def url(self, url):
        """Sets the url of this Collaboration.

        The LTI launch url to view collaboration.  # noqa: E501

        :param url: The url of this Collaboration.  # noqa: E501
        :type: str
        """

        self._url = url

    @property
    def created_at(self):
        """Gets the created_at of this Collaboration.  # noqa: E501

        The timestamp when the collaboration was created  # noqa: E501

        :return: The created_at of this Collaboration.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._created_at

    @created_at.setter
    def created_at(self, created_at):
        """Sets the created_at of this Collaboration.

        The timestamp when the collaboration was created  # noqa: E501

        :param created_at: The created_at of this Collaboration.  # noqa: E501
        :type: ModelDatetime
        """

        self._created_at = created_at

    @property
    def updated_at(self):
        """Gets the updated_at of this Collaboration.  # noqa: E501

        The timestamp when the collaboration was last modified  # noqa: E501

        :return: The updated_at of this Collaboration.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._updated_at

    @updated_at.setter
    def updated_at(self, updated_at):
        """Sets the updated_at of this Collaboration.

        The timestamp when the collaboration was last modified  # noqa: E501

        :param updated_at: The updated_at of this Collaboration.  # noqa: E501
        :type: ModelDatetime
        """

        self._updated_at = updated_at

    @property
    def description(self):
        """Gets the description of this Collaboration.  # noqa: E501


        :return: The description of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._description

    @description.setter
    def description(self, description):
        """Sets the description of this Collaboration.


        :param description: The description of this Collaboration.  # noqa: E501
        :type: str
        """

        self._description = description

    @property
    def title(self):
        """Gets the title of this Collaboration.  # noqa: E501


        :return: The title of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._title

    @title.setter
    def title(self, title):
        """Sets the title of this Collaboration.


        :param title: The title of this Collaboration.  # noqa: E501
        :type: str
        """

        self._title = title

    @property
    def type(self):
        """Gets the type of this Collaboration.  # noqa: E501

        Another representation of the collaboration type  # noqa: E501

        :return: The type of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._type

    @type.setter
    def type(self, type):
        """Sets the type of this Collaboration.

        Another representation of the collaboration type  # noqa: E501

        :param type: The type of this Collaboration.  # noqa: E501
        :type: str
        """

        self._type = type

    @property
    def update_url(self):
        """Gets the update_url of this Collaboration.  # noqa: E501

        The LTI launch url to edit the collaboration  # noqa: E501

        :return: The update_url of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._update_url

    @update_url.setter
    def update_url(self, update_url):
        """Sets the update_url of this Collaboration.

        The LTI launch url to edit the collaboration  # noqa: E501

        :param update_url: The update_url of this Collaboration.  # noqa: E501
        :type: str
        """

        self._update_url = update_url

    @property
    def user_name(self):
        """Gets the user_name of this Collaboration.  # noqa: E501

        The name of the user who owns the collaboration  # noqa: E501

        :return: The user_name of this Collaboration.  # noqa: E501
        :rtype: str
        """
        return self._user_name

    @user_name.setter
    def user_name(self, user_name):
        """Sets the user_name of this Collaboration.

        The name of the user who owns the collaboration  # noqa: E501

        :param user_name: The user_name of this Collaboration.  # noqa: E501
        :type: str
        """

        self._user_name = user_name

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
        if issubclass(Collaboration, dict):
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
        if not isinstance(other, Collaboration):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, Collaboration):
            return True

        return self.to_dict() != other.to_dict()
