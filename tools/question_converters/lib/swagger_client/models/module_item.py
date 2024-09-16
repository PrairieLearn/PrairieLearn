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


class ModuleItem(object):
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
        'module_id': 'int',
        'position': 'int',
        'title': 'str',
        'indent': 'int',
        'type': 'str',
        'content_id': 'int',
        'html_url': 'str',
        'url': 'str',
        'page_url': 'str',
        'external_url': 'str',
        'new_tab': 'bool',
        'completion_requirement': 'CompletionRequirement',
        'content_details': 'ContentDetails',
        'published': 'bool'
    }

    attribute_map = {
        'id': 'id',
        'module_id': 'module_id',
        'position': 'position',
        'title': 'title',
        'indent': 'indent',
        'type': 'type',
        'content_id': 'content_id',
        'html_url': 'html_url',
        'url': 'url',
        'page_url': 'page_url',
        'external_url': 'external_url',
        'new_tab': 'new_tab',
        'completion_requirement': 'completion_requirement',
        'content_details': 'content_details',
        'published': 'published'
    }

    def __init__(self, id=None, module_id=None, position=None, title=None, indent=None, type=None, content_id=None, html_url=None, url=None, page_url=None, external_url=None, new_tab=None, completion_requirement=None, content_details=None, published=None, _configuration=None):  # noqa: E501
        """ModuleItem - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._module_id = None
        self._position = None
        self._title = None
        self._indent = None
        self._type = None
        self._content_id = None
        self._html_url = None
        self._url = None
        self._page_url = None
        self._external_url = None
        self._new_tab = None
        self._completion_requirement = None
        self._content_details = None
        self._published = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if module_id is not None:
            self.module_id = module_id
        if position is not None:
            self.position = position
        if title is not None:
            self.title = title
        if indent is not None:
            self.indent = indent
        if type is not None:
            self.type = type
        if content_id is not None:
            self.content_id = content_id
        if html_url is not None:
            self.html_url = html_url
        if url is not None:
            self.url = url
        if page_url is not None:
            self.page_url = page_url
        if external_url is not None:
            self.external_url = external_url
        if new_tab is not None:
            self.new_tab = new_tab
        if completion_requirement is not None:
            self.completion_requirement = completion_requirement
        if content_details is not None:
            self.content_details = content_details
        if published is not None:
            self.published = published

    @property
    def id(self):
        """Gets the id of this ModuleItem.  # noqa: E501

        the unique identifier for the module item  # noqa: E501

        :return: The id of this ModuleItem.  # noqa: E501
        :rtype: int
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this ModuleItem.

        the unique identifier for the module item  # noqa: E501

        :param id: The id of this ModuleItem.  # noqa: E501
        :type: int
        """

        self._id = id

    @property
    def module_id(self):
        """Gets the module_id of this ModuleItem.  # noqa: E501

        the id of the Module this item appears in  # noqa: E501

        :return: The module_id of this ModuleItem.  # noqa: E501
        :rtype: int
        """
        return self._module_id

    @module_id.setter
    def module_id(self, module_id):
        """Sets the module_id of this ModuleItem.

        the id of the Module this item appears in  # noqa: E501

        :param module_id: The module_id of this ModuleItem.  # noqa: E501
        :type: int
        """

        self._module_id = module_id

    @property
    def position(self):
        """Gets the position of this ModuleItem.  # noqa: E501

        the position of this item in the module (1-based)  # noqa: E501

        :return: The position of this ModuleItem.  # noqa: E501
        :rtype: int
        """
        return self._position

    @position.setter
    def position(self, position):
        """Sets the position of this ModuleItem.

        the position of this item in the module (1-based)  # noqa: E501

        :param position: The position of this ModuleItem.  # noqa: E501
        :type: int
        """

        self._position = position

    @property
    def title(self):
        """Gets the title of this ModuleItem.  # noqa: E501

        the title of this item  # noqa: E501

        :return: The title of this ModuleItem.  # noqa: E501
        :rtype: str
        """
        return self._title

    @title.setter
    def title(self, title):
        """Sets the title of this ModuleItem.

        the title of this item  # noqa: E501

        :param title: The title of this ModuleItem.  # noqa: E501
        :type: str
        """

        self._title = title

    @property
    def indent(self):
        """Gets the indent of this ModuleItem.  # noqa: E501

        0-based indent level; module items may be indented to show a hierarchy  # noqa: E501

        :return: The indent of this ModuleItem.  # noqa: E501
        :rtype: int
        """
        return self._indent

    @indent.setter
    def indent(self, indent):
        """Sets the indent of this ModuleItem.

        0-based indent level; module items may be indented to show a hierarchy  # noqa: E501

        :param indent: The indent of this ModuleItem.  # noqa: E501
        :type: int
        """

        self._indent = indent

    @property
    def type(self):
        """Gets the type of this ModuleItem.  # noqa: E501

        the type of object referred to one of 'File', 'Page', 'Discussion', 'Assignment', 'Quiz', 'SubHeader', 'ExternalUrl', 'ExternalTool'  # noqa: E501

        :return: The type of this ModuleItem.  # noqa: E501
        :rtype: str
        """
        return self._type

    @type.setter
    def type(self, type):
        """Sets the type of this ModuleItem.

        the type of object referred to one of 'File', 'Page', 'Discussion', 'Assignment', 'Quiz', 'SubHeader', 'ExternalUrl', 'ExternalTool'  # noqa: E501

        :param type: The type of this ModuleItem.  # noqa: E501
        :type: str
        """

        self._type = type

    @property
    def content_id(self):
        """Gets the content_id of this ModuleItem.  # noqa: E501

        the id of the object referred to applies to 'File', 'Discussion', 'Assignment', 'Quiz', 'ExternalTool' types  # noqa: E501

        :return: The content_id of this ModuleItem.  # noqa: E501
        :rtype: int
        """
        return self._content_id

    @content_id.setter
    def content_id(self, content_id):
        """Sets the content_id of this ModuleItem.

        the id of the object referred to applies to 'File', 'Discussion', 'Assignment', 'Quiz', 'ExternalTool' types  # noqa: E501

        :param content_id: The content_id of this ModuleItem.  # noqa: E501
        :type: int
        """

        self._content_id = content_id

    @property
    def html_url(self):
        """Gets the html_url of this ModuleItem.  # noqa: E501

        link to the item in Canvas  # noqa: E501

        :return: The html_url of this ModuleItem.  # noqa: E501
        :rtype: str
        """
        return self._html_url

    @html_url.setter
    def html_url(self, html_url):
        """Sets the html_url of this ModuleItem.

        link to the item in Canvas  # noqa: E501

        :param html_url: The html_url of this ModuleItem.  # noqa: E501
        :type: str
        """

        self._html_url = html_url

    @property
    def url(self):
        """Gets the url of this ModuleItem.  # noqa: E501

        (Optional) link to the Canvas API object, if applicable  # noqa: E501

        :return: The url of this ModuleItem.  # noqa: E501
        :rtype: str
        """
        return self._url

    @url.setter
    def url(self, url):
        """Sets the url of this ModuleItem.

        (Optional) link to the Canvas API object, if applicable  # noqa: E501

        :param url: The url of this ModuleItem.  # noqa: E501
        :type: str
        """

        self._url = url

    @property
    def page_url(self):
        """Gets the page_url of this ModuleItem.  # noqa: E501

        (only for 'Page' type) unique locator for the linked wiki page  # noqa: E501

        :return: The page_url of this ModuleItem.  # noqa: E501
        :rtype: str
        """
        return self._page_url

    @page_url.setter
    def page_url(self, page_url):
        """Sets the page_url of this ModuleItem.

        (only for 'Page' type) unique locator for the linked wiki page  # noqa: E501

        :param page_url: The page_url of this ModuleItem.  # noqa: E501
        :type: str
        """

        self._page_url = page_url

    @property
    def external_url(self):
        """Gets the external_url of this ModuleItem.  # noqa: E501

        (only for 'ExternalUrl' and 'ExternalTool' types) external url that the item points to  # noqa: E501

        :return: The external_url of this ModuleItem.  # noqa: E501
        :rtype: str
        """
        return self._external_url

    @external_url.setter
    def external_url(self, external_url):
        """Sets the external_url of this ModuleItem.

        (only for 'ExternalUrl' and 'ExternalTool' types) external url that the item points to  # noqa: E501

        :param external_url: The external_url of this ModuleItem.  # noqa: E501
        :type: str
        """

        self._external_url = external_url

    @property
    def new_tab(self):
        """Gets the new_tab of this ModuleItem.  # noqa: E501

        (only for 'ExternalTool' type) whether the external tool opens in a new tab  # noqa: E501

        :return: The new_tab of this ModuleItem.  # noqa: E501
        :rtype: bool
        """
        return self._new_tab

    @new_tab.setter
    def new_tab(self, new_tab):
        """Sets the new_tab of this ModuleItem.

        (only for 'ExternalTool' type) whether the external tool opens in a new tab  # noqa: E501

        :param new_tab: The new_tab of this ModuleItem.  # noqa: E501
        :type: bool
        """

        self._new_tab = new_tab

    @property
    def completion_requirement(self):
        """Gets the completion_requirement of this ModuleItem.  # noqa: E501

        Completion requirement for this module item  # noqa: E501

        :return: The completion_requirement of this ModuleItem.  # noqa: E501
        :rtype: CompletionRequirement
        """
        return self._completion_requirement

    @completion_requirement.setter
    def completion_requirement(self, completion_requirement):
        """Sets the completion_requirement of this ModuleItem.

        Completion requirement for this module item  # noqa: E501

        :param completion_requirement: The completion_requirement of this ModuleItem.  # noqa: E501
        :type: CompletionRequirement
        """

        self._completion_requirement = completion_requirement

    @property
    def content_details(self):
        """Gets the content_details of this ModuleItem.  # noqa: E501

        (Present only if requested through include[]=content_details) If applicable, returns additional details specific to the associated object  # noqa: E501

        :return: The content_details of this ModuleItem.  # noqa: E501
        :rtype: ContentDetails
        """
        return self._content_details

    @content_details.setter
    def content_details(self, content_details):
        """Sets the content_details of this ModuleItem.

        (Present only if requested through include[]=content_details) If applicable, returns additional details specific to the associated object  # noqa: E501

        :param content_details: The content_details of this ModuleItem.  # noqa: E501
        :type: ContentDetails
        """

        self._content_details = content_details

    @property
    def published(self):
        """Gets the published of this ModuleItem.  # noqa: E501

        (Optional) Whether this module item is published. This field is present only if the caller has permission to view unpublished items.  # noqa: E501

        :return: The published of this ModuleItem.  # noqa: E501
        :rtype: bool
        """
        return self._published

    @published.setter
    def published(self, published):
        """Sets the published of this ModuleItem.

        (Optional) Whether this module item is published. This field is present only if the caller has permission to view unpublished items.  # noqa: E501

        :param published: The published of this ModuleItem.  # noqa: E501
        :type: bool
        """

        self._published = published

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
        if issubclass(ModuleItem, dict):
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
        if not isinstance(other, ModuleItem):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, ModuleItem):
            return True

        return self.to_dict() != other.to_dict()
