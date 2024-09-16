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


class LineItem(object):
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
        'score_maximum': 'float',
        'label': 'str',
        'tag': 'str',
        'resource_id': 'str',
        'resource_link_id': 'str',
        'httpscanvas_instructure_comltisubmission_type': 'str',
        'httpscanvas_instructure_comltilaunch_url': 'str'
    }

    attribute_map = {
        'id': 'id',
        'score_maximum': 'scoreMaximum',
        'label': 'label',
        'tag': 'tag',
        'resource_id': 'resourceId',
        'resource_link_id': 'resourceLinkId',
        'httpscanvas_instructure_comltisubmission_type': 'https://canvas.instructure.com/lti/submission_type',
        'httpscanvas_instructure_comltilaunch_url': 'https://canvas.instructure.com/lti/launch_url'
    }

    def __init__(self, id=None, score_maximum=None, label=None, tag=None, resource_id=None, resource_link_id=None, httpscanvas_instructure_comltisubmission_type=None, httpscanvas_instructure_comltilaunch_url=None, _configuration=None):  # noqa: E501
        """LineItem - a model defined in Swagger"""  # noqa: E501
        if _configuration is None:
            _configuration = Configuration()
        self._configuration = _configuration

        self._id = None
        self._score_maximum = None
        self._label = None
        self._tag = None
        self._resource_id = None
        self._resource_link_id = None
        self._httpscanvas_instructure_comltisubmission_type = None
        self._httpscanvas_instructure_comltilaunch_url = None
        self.discriminator = None

        if id is not None:
            self.id = id
        if score_maximum is not None:
            self.score_maximum = score_maximum
        if label is not None:
            self.label = label
        if tag is not None:
            self.tag = tag
        if resource_id is not None:
            self.resource_id = resource_id
        if resource_link_id is not None:
            self.resource_link_id = resource_link_id
        if httpscanvas_instructure_comltisubmission_type is not None:
            self.httpscanvas_instructure_comltisubmission_type = httpscanvas_instructure_comltisubmission_type
        if httpscanvas_instructure_comltilaunch_url is not None:
            self.httpscanvas_instructure_comltilaunch_url = httpscanvas_instructure_comltilaunch_url

    @property
    def id(self):
        """Gets the id of this LineItem.  # noqa: E501

        The fully qualified URL for showing, updating, and deleting the Line Item  # noqa: E501

        :return: The id of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._id

    @id.setter
    def id(self, id):
        """Sets the id of this LineItem.

        The fully qualified URL for showing, updating, and deleting the Line Item  # noqa: E501

        :param id: The id of this LineItem.  # noqa: E501
        :type: str
        """

        self._id = id

    @property
    def score_maximum(self):
        """Gets the score_maximum of this LineItem.  # noqa: E501

        The maximum score of the Line Item  # noqa: E501

        :return: The score_maximum of this LineItem.  # noqa: E501
        :rtype: float
        """
        return self._score_maximum

    @score_maximum.setter
    def score_maximum(self, score_maximum):
        """Sets the score_maximum of this LineItem.

        The maximum score of the Line Item  # noqa: E501

        :param score_maximum: The score_maximum of this LineItem.  # noqa: E501
        :type: float
        """

        self._score_maximum = score_maximum

    @property
    def label(self):
        """Gets the label of this LineItem.  # noqa: E501

        The label of the Line Item.  # noqa: E501

        :return: The label of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._label

    @label.setter
    def label(self, label):
        """Sets the label of this LineItem.

        The label of the Line Item.  # noqa: E501

        :param label: The label of this LineItem.  # noqa: E501
        :type: str
        """

        self._label = label

    @property
    def tag(self):
        """Gets the tag of this LineItem.  # noqa: E501

        Tag used to qualify a line Item beyond its ids  # noqa: E501

        :return: The tag of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._tag

    @tag.setter
    def tag(self, tag):
        """Sets the tag of this LineItem.

        Tag used to qualify a line Item beyond its ids  # noqa: E501

        :param tag: The tag of this LineItem.  # noqa: E501
        :type: str
        """

        self._tag = tag

    @property
    def resource_id(self):
        """Gets the resource_id of this LineItem.  # noqa: E501

        A Tool Provider specified id for the Line Item. Multiple line items can share the same resourceId within a given context  # noqa: E501

        :return: The resource_id of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._resource_id

    @resource_id.setter
    def resource_id(self, resource_id):
        """Sets the resource_id of this LineItem.

        A Tool Provider specified id for the Line Item. Multiple line items can share the same resourceId within a given context  # noqa: E501

        :param resource_id: The resource_id of this LineItem.  # noqa: E501
        :type: str
        """

        self._resource_id = resource_id

    @property
    def resource_link_id(self):
        """Gets the resource_link_id of this LineItem.  # noqa: E501

        The resource link id the Line Item is attached to  # noqa: E501

        :return: The resource_link_id of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._resource_link_id

    @resource_link_id.setter
    def resource_link_id(self, resource_link_id):
        """Sets the resource_link_id of this LineItem.

        The resource link id the Line Item is attached to  # noqa: E501

        :param resource_link_id: The resource_link_id of this LineItem.  # noqa: E501
        :type: str
        """

        self._resource_link_id = resource_link_id

    @property
    def httpscanvas_instructure_comltisubmission_type(self):
        """Gets the httpscanvas_instructure_comltisubmission_type of this LineItem.  # noqa: E501

        The extension that defines the submission_type of the line_item. Only returns if set through the line_item create endpoint.  # noqa: E501

        :return: The httpscanvas_instructure_comltisubmission_type of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._httpscanvas_instructure_comltisubmission_type

    @httpscanvas_instructure_comltisubmission_type.setter
    def httpscanvas_instructure_comltisubmission_type(self, httpscanvas_instructure_comltisubmission_type):
        """Sets the httpscanvas_instructure_comltisubmission_type of this LineItem.

        The extension that defines the submission_type of the line_item. Only returns if set through the line_item create endpoint.  # noqa: E501

        :param httpscanvas_instructure_comltisubmission_type: The httpscanvas_instructure_comltisubmission_type of this LineItem.  # noqa: E501
        :type: str
        """

        self._httpscanvas_instructure_comltisubmission_type = httpscanvas_instructure_comltisubmission_type

    @property
    def httpscanvas_instructure_comltilaunch_url(self):
        """Gets the httpscanvas_instructure_comltilaunch_url of this LineItem.  # noqa: E501

        The launch url of the Line Item. Only returned if `include=launch_url` query parameter is passed, and only for Show and List actions.  # noqa: E501

        :return: The httpscanvas_instructure_comltilaunch_url of this LineItem.  # noqa: E501
        :rtype: str
        """
        return self._httpscanvas_instructure_comltilaunch_url

    @httpscanvas_instructure_comltilaunch_url.setter
    def httpscanvas_instructure_comltilaunch_url(self, httpscanvas_instructure_comltilaunch_url):
        """Sets the httpscanvas_instructure_comltilaunch_url of this LineItem.

        The launch url of the Line Item. Only returned if `include=launch_url` query parameter is passed, and only for Show and List actions.  # noqa: E501

        :param httpscanvas_instructure_comltilaunch_url: The httpscanvas_instructure_comltilaunch_url of this LineItem.  # noqa: E501
        :type: str
        """

        self._httpscanvas_instructure_comltilaunch_url = httpscanvas_instructure_comltilaunch_url

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
        if issubclass(LineItem, dict):
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
        if not isinstance(other, LineItem):
            return False

        return self.to_dict() == other.to_dict()

    def __ne__(self, other):
        """Returns true if both objects are not equal"""
        if not isinstance(other, LineItem):
            return True

        return self.to_dict() != other.to_dict()
