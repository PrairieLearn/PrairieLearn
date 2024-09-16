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


class Page(object):
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
        'page_id': 'int',
        'url': 'str',
        'title': 'str',
        'created_at': 'ModelDatetime',
        'updated_at': 'ModelDatetime',
        'hide_from_students': 'bool',
        'editing_roles': 'str',
        'last_edited_by': 'User',
        'body': 'str',
        'published': 'bool',
        'publish_at': 'ModelDatetime',
        'front_page': 'bool',
        'locked_for_user': 'bool',
        'lock_info': 'LockInfo',
        'lock_explanation': 'str'
    }

    attribute_map = {
        'page_id': 'page_id',
        'url': 'url',
        'title': 'title',
        'created_at': 'created_at',
        'updated_at': 'updated_at',
        'hide_from_students': 'hide_from_students',
        'editing_roles': 'editing_roles',
        'last_edited_by': 'last_edited_by',
        'body': 'body',
        'published': 'published',
        'publish_at': 'publish_at',
        'front_page': 'front_page',
        'locked_for_user': 'locked_for_user',
        'lock_info': 'lock_info',
        'lock_explanation': 'lock_explanation'
    }

    def __init__(self, page_id=None, url=None, title=None, created_at=None, updated_at=None, hide_from_students=None, editing_roles=None, last_edited_by=None, body=None, published=None, publish_at=None, front_page=None, locked_for_user=None, lock_info=None, lock_explanation=None, _configuration=None):  # noqa: E501
        """Page - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._page_id = None
        self._url = None
        self._title = None
        self._created_at = None
        self._updated_at = None
        self._hide_from_students = None
        self._editing_roles = None
        self._last_edited_by = None
        self._body = None
        self._published = None
        self._publish_at = None
        self._front_page = None
        self._locked_for_user = None
        self._lock_info = None
        self._lock_explanation = None
        self.discriminator = None

        if page_id is not None:
            self.page_id = page_id
        if url is not None:
            self.url = url
        if title is not None:
            self.title = title
        if created_at is not None:
            self.created_at = created_at
        if updated_at is not None:
            self.updated_at = updated_at
        if hide_from_students is not None:
            self.hide_from_students = hide_from_students
        if editing_roles is not None:
            self.editing_roles = editing_roles
        if last_edited_by is not None:
            self.last_edited_by = last_edited_by
        if body is not None:
            self.body = body
        if published is not None:
            self.published = published
        if publish_at is not None:
            self.publish_at = publish_at
        if front_page is not None:
            self.front_page = front_page
        if locked_for_user is not None:
            self.locked_for_user = locked_for_user
        if lock_info is not None:
            self.lock_info = lock_info
        if lock_explanation is not None:
            self.lock_explanation = lock_explanation

    @property
    def page_id(self):
        """Gets the page_id of this Page.  # noqa: E501

        the ID of the page  # noqa: E501

        :return: The page_id of this Page.  # noqa: E501
        :rtype: int
        """
        return self._page_id

    @page_id.setter
    def page_id(self, page_id):
        """Sets the page_id of this Page.

        the ID of the page  # noqa: E501

        :param page_id: The page_id of this Page.  # noqa: E501
        :type: int
        """

        self._page_id = page_id

    @property
    def url(self):
        """Gets the url of this Page.  # noqa: E501

        the unique locator for the page  # noqa: E501

        :return: The url of this Page.  # noqa: E501
        :rtype: str
        """
        return self._url

    @url.setter
    def url(self, url):
        """Sets the url of this Page.

        the unique locator for the page  # noqa: E501

        :param url: The url of this Page.  # noqa: E501
        :type: str
        """

        self._url = url

    @property
    def title(self):
        """Gets the title of this Page.  # noqa: E501

        the title of the page  # noqa: E501

        :return: The title of this Page.  # noqa: E501
        :rtype: str
        """
        return self._title

    @title.setter
    def title(self, title):
        """Sets the title of this Page.

        the title of the page  # noqa: E501

        :param title: The title of this Page.  # noqa: E501
        :type: str
        """

        self._title = title

    @property
    def created_at(self):
        """Gets the created_at of this Page.  # noqa: E501

        the creation date for the page  # noqa: E501

        :return: The created_at of this Page.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._created_at

    @created_at.setter
    def created_at(self, created_at):
        """Sets the created_at of this Page.

        the creation date for the page  # noqa: E501

        :param created_at: The created_at of this Page.  # noqa: E501
        :type: ModelDatetime
        """

        self._created_at = created_at

    @property
    def updated_at(self):
        """Gets the updated_at of this Page.  # noqa: E501

        the date the page was last updated  # noqa: E501

        :return: The updated_at of this Page.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._updated_at

    @updated_at.setter
    def updated_at(self, updated_at):
        """Sets the updated_at of this Page.

        the date the page was last updated  # noqa: E501

        :param updated_at: The updated_at of this Page.  # noqa: E501
        :type: ModelDatetime
        """

        self._updated_at = updated_at

    @property
    def hide_from_students(self):
        """Gets the hide_from_students of this Page.  # noqa: E501

        (DEPRECATED) whether this page is hidden from students (note: this is always reflected as the inverse of the published value)  # noqa: E501

        :return: The hide_from_students of this Page.  # noqa: E501
        :rtype: bool
        """
        return self._hide_from_students

    @hide_from_students.setter
    def hide_from_students(self, hide_from_students):
        """Sets the hide_from_students of this Page.

        (DEPRECATED) whether this page is hidden from students (note: this is always reflected as the inverse of the published value)  # noqa: E501

        :param hide_from_students: The hide_from_students of this Page.  # noqa: E501
        :type: bool
        """

        self._hide_from_students = hide_from_students

    @property
    def editing_roles(self):
        """Gets the editing_roles of this Page.  # noqa: E501

        roles allowed to edit the page; comma-separated list comprising a combination of 'teachers', 'students', 'members', and/or 'public' if not supplied, course defaults are used  # noqa: E501

        :return: The editing_roles of this Page.  # noqa: E501
        :rtype: str
        """
        return self._editing_roles

    @editing_roles.setter
    def editing_roles(self, editing_roles):
        """Sets the editing_roles of this Page.

        roles allowed to edit the page; comma-separated list comprising a combination of 'teachers', 'students', 'members', and/or 'public' if not supplied, course defaults are used  # noqa: E501

        :param editing_roles: The editing_roles of this Page.  # noqa: E501
        :type: str
        """

        self._editing_roles = editing_roles

    @property
    def last_edited_by(self):
        """Gets the last_edited_by of this Page.  # noqa: E501

        the User who last edited the page (this may not be present if the page was imported from another system)  # noqa: E501

        :return: The last_edited_by of this Page.  # noqa: E501
        :rtype: User
        """
        return self._last_edited_by

    @last_edited_by.setter
    def last_edited_by(self, last_edited_by):
        """Sets the last_edited_by of this Page.

        the User who last edited the page (this may not be present if the page was imported from another system)  # noqa: E501

        :param last_edited_by: The last_edited_by of this Page.  # noqa: E501
        :type: User
        """

        self._last_edited_by = last_edited_by

    @property
    def body(self):
        """Gets the body of this Page.  # noqa: E501

        the page content, in HTML (present when requesting a single page; optionally included when listing pages)  # noqa: E501

        :return: The body of this Page.  # noqa: E501
        :rtype: str
        """
        return self._body

    @body.setter
    def body(self, body):
        """Sets the body of this Page.

        the page content, in HTML (present when requesting a single page; optionally included when listing pages)  # noqa: E501

        :param body: The body of this Page.  # noqa: E501
        :type: str
        """

        self._body = body

    @property
    def published(self):
        """Gets the published of this Page.  # noqa: E501

        whether the page is published (true) or draft state (false).  # noqa: E501

        :return: The published of this Page.  # noqa: E501
        :rtype: bool
        """
        return self._published

    @published.setter
    def published(self, published):
        """Sets the published of this Page.

        whether the page is published (true) or draft state (false).  # noqa: E501

        :param published: The published of this Page.  # noqa: E501
        :type: bool
        """

        self._published = published

    @property
    def publish_at(self):
        """Gets the publish_at of this Page.  # noqa: E501

        scheduled publication date for this page  # noqa: E501

        :return: The publish_at of this Page.  # noqa: E501
        :rtype: ModelDatetime
        """
        return self._publish_at

    @publish_at.setter
    def publish_at(self, publish_at):
        """Sets the publish_at of this Page.

        scheduled publication date for this page  # noqa: E501

        :param publish_at: The publish_at of this Page.  # noqa: E501
        :type: ModelDatetime
        """

        self._publish_at = publish_at

    @property
    def front_page(self):
        """Gets the front_page of this Page.  # noqa: E501

        whether this page is the front page for the wiki  # noqa: E501

        :return: The front_page of this Page.  # noqa: E501
        :rtype: bool
        """
        return self._front_page

    @front_page.setter
    def front_page(self, front_page):
        """Sets the front_page of this Page.

        whether this page is the front page for the wiki  # noqa: E501

        :param front_page: The front_page of this Page.  # noqa: E501
        :type: bool
        """

        self._front_page = front_page

    @property
    def locked_for_user(self):
        """Gets the locked_for_user of this Page.  # noqa: E501

        Whether or not this is locked for the user.  # noqa: E501

        :return: The locked_for_user of this Page.  # noqa: E501
        :rtype: bool
        """
        return self._locked_for_user

    @locked_for_user.setter
    def locked_for_user(self, locked_for_user):
        """Sets the locked_for_user of this Page.

        Whether or not this is locked for the user.  # noqa: E501

        :param locked_for_user: The locked_for_user of this Page.  # noqa: E501
        :type: bool
        """

        self._locked_for_user = locked_for_user

    @property
    def lock_info(self):
        """Gets the lock_info of this Page.  # noqa: E501

        (Optional) Information for the user about the lock. Present when locked_for_user is true.  # noqa: E501

        :return: The lock_info of this Page.  # noqa: E501
        :rtype: LockInfo
        """
        return self._lock_info

    @lock_info.setter
    def lock_info(self, lock_info):
        """Sets the lock_info of this Page.

        (Optional) Information for the user about the lock. Present when locked_for_user is true.  # noqa: E501

        :param lock_info: The lock_info of this Page.  # noqa: E501
        :type: LockInfo
        """

        self._lock_info = lock_info

    @property
    def lock_explanation(self):
        """Gets the lock_explanation of this Page.  # noqa: E501

        (Optional) An explanation of why this is locked for the user. Present when locked_for_user is true.  # noqa: E501

        :return: The lock_explanation of this Page.  # noqa: E501
        :rtype: str
        """
        return self._lock_explanation

    @lock_explanation.setter
    def lock_explanation(self, lock_explanation):
        """Sets the lock_explanation of this Page.

        (Optional) An explanation of why this is locked for the user. Present when locked_for_user is true.  # noqa: E501

        :param lock_explanation: The lock_explanation of this Page.  # noqa: E501
        :type: str
        """

        self._lock_explanation = lock_explanation

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
        if issubclass(Page, dict):
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
        if not isinstance(other, Page):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, Page):
            return True

        return self.to_dict() != other.to_dict()
