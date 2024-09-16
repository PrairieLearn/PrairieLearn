# coding: utf-8

"""

    No description provided (generated by Swagger Codegen https://github.com/swagger-api/swagger-codegen)  # noqa: E501

    OpenAPI spec version: 1.0
    
    Generated by: https://github.com/swagger-api/swagger-codegen.git
"""


from __future__ import absolute_import

import re  # noqa: F401

# python 2 and python 3 compatibility library
import six

from swagger_client.api_client import ApiClient


class ConferencesApi(object):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    Ref: https://github.com/swagger-api/swagger-codegen
    """

    def __init__(self, api_client=None):
        if api_client is None:
            api_client = ApiClient()
        self.api_client = api_client

    def list_conferences_courses(self, course_id, **kwargs):  # noqa: E501
        """List conferences  # noqa: E501

        Retrieve the paginated list of conferences for this context  This API returns a JSON object containing the list of conferences, the key for the list of conferences is \"conferences\"  # noqa: E501
        This method makes a synchronous HTTP request by default. To make an
        asynchronous HTTP request, please pass async_req=True
        >>> thread = api.list_conferences_courses(course_id, async_req=True)
        >>> result = thread.get()

        :param async_req bool
        :param str course_id: ID (required)
        :return: list[Conference]
                 If the method is called asynchronously,
                 returns the request thread.
        """
        kwargs['_return_http_data_only'] = True
        if kwargs.get('async_req'):
            return self.list_conferences_courses_with_http_info(course_id, **kwargs)  # noqa: E501
        else:
            (data) = self.list_conferences_courses_with_http_info(course_id, **kwargs)  # noqa: E501
            return data

    def list_conferences_courses_with_http_info(self, course_id, **kwargs):  # noqa: E501
        """List conferences  # noqa: E501

        Retrieve the paginated list of conferences for this context  This API returns a JSON object containing the list of conferences, the key for the list of conferences is \"conferences\"  # noqa: E501
        This method makes a synchronous HTTP request by default. To make an
        asynchronous HTTP request, please pass async_req=True
        >>> thread = api.list_conferences_courses_with_http_info(course_id, async_req=True)
        >>> result = thread.get()

        :param async_req bool
        :param str course_id: ID (required)
        :return: list[Conference]
                 If the method is called asynchronously,
                 returns the request thread.
        """

        all_params = ['course_id']  # noqa: E501
        all_params.append('async_req')
        all_params.append('_return_http_data_only')
        all_params.append('_preload_content')
        all_params.append('_request_timeout')

        params = locals()
        for key, val in six.iteritems(params['kwargs']):
            if key not in all_params:
                raise TypeError(
                    "Got an unexpected keyword argument '%s'"
                    " to method list_conferences_courses" % key
                )
            params[key] = val
        del params['kwargs']
        # verify the required parameter 'course_id' is set
        if self.api_client.client_side_validation and ('course_id' not in params or
                                                       params['course_id'] is None):  # noqa: E501
            raise ValueError("Missing the required parameter `course_id` when calling `list_conferences_courses`")  # noqa: E501

        collection_formats = {}

        path_params = {}
        if 'course_id' in params:
            path_params['course_id'] = params['course_id']  # noqa: E501

        query_params = []

        header_params = {}

        form_params = []
        local_var_files = {}

        body_params = None
        # HTTP header `Accept`
        header_params['Accept'] = self.api_client.select_header_accept(
            ['application/json'])  # noqa: E501

        # Authentication setting
        auth_settings = []  # noqa: E501

        return self.api_client.call_api(
            '/v1/courses/{course_id}/conferences', 'GET',
            path_params,
            query_params,
            header_params,
            body=body_params,
            post_params=form_params,
            files=local_var_files,
            response_type='list[Conference]',  # noqa: E501
            auth_settings=auth_settings,
            async_req=params.get('async_req'),
            _return_http_data_only=params.get('_return_http_data_only'),
            _preload_content=params.get('_preload_content', True),
            _request_timeout=params.get('_request_timeout'),
            collection_formats=collection_formats)

    def list_conferences_for_current_user(self, **kwargs):  # noqa: E501
        """List conferences for the current user  # noqa: E501

        Retrieve the paginated list of conferences for all courses and groups the current user belongs to  This API returns a JSON object containing the list of conferences. The key for the list of conferences is \"conferences\".  # noqa: E501
        This method makes a synchronous HTTP request by default. To make an
        asynchronous HTTP request, please pass async_req=True
        >>> thread = api.list_conferences_for_current_user(async_req=True)
        >>> result = thread.get()

        :param async_req bool
        :param str state: If set to \"live\", returns only conferences that are live (i.e., have started and not finished yet). If omitted, returns all conferences for this user's groups and courses.
        :return: list[Conference]
                 If the method is called asynchronously,
                 returns the request thread.
        """
        kwargs['_return_http_data_only'] = True
        if kwargs.get('async_req'):
            return self.list_conferences_for_current_user_with_http_info(**kwargs)  # noqa: E501
        else:
            (data) = self.list_conferences_for_current_user_with_http_info(**kwargs)  # noqa: E501
            return data

    def list_conferences_for_current_user_with_http_info(self, **kwargs):  # noqa: E501
        """List conferences for the current user  # noqa: E501

        Retrieve the paginated list of conferences for all courses and groups the current user belongs to  This API returns a JSON object containing the list of conferences. The key for the list of conferences is \"conferences\".  # noqa: E501
        This method makes a synchronous HTTP request by default. To make an
        asynchronous HTTP request, please pass async_req=True
        >>> thread = api.list_conferences_for_current_user_with_http_info(async_req=True)
        >>> result = thread.get()

        :param async_req bool
        :param str state: If set to \"live\", returns only conferences that are live (i.e., have started and not finished yet). If omitted, returns all conferences for this user's groups and courses.
        :return: list[Conference]
                 If the method is called asynchronously,
                 returns the request thread.
        """

        all_params = ['state']  # noqa: E501
        all_params.append('async_req')
        all_params.append('_return_http_data_only')
        all_params.append('_preload_content')
        all_params.append('_request_timeout')

        params = locals()
        for key, val in six.iteritems(params['kwargs']):
            if key not in all_params:
                raise TypeError(
                    "Got an unexpected keyword argument '%s'"
                    " to method list_conferences_for_current_user" % key
                )
            params[key] = val
        del params['kwargs']

        collection_formats = {}

        path_params = {}

        query_params = []
        if 'state' in params:
            query_params.append(('state', params['state']))  # noqa: E501

        header_params = {}

        form_params = []
        local_var_files = {}

        body_params = None
        # HTTP header `Accept`
        header_params['Accept'] = self.api_client.select_header_accept(
            ['application/json'])  # noqa: E501

        # Authentication setting
        auth_settings = []  # noqa: E501

        return self.api_client.call_api(
            '/v1/conferences', 'GET',
            path_params,
            query_params,
            header_params,
            body=body_params,
            post_params=form_params,
            files=local_var_files,
            response_type='list[Conference]',  # noqa: E501
            auth_settings=auth_settings,
            async_req=params.get('async_req'),
            _return_http_data_only=params.get('_return_http_data_only'),
            _preload_content=params.get('_preload_content', True),
            _request_timeout=params.get('_request_timeout'),
            collection_formats=collection_formats)

    def list_conferences_groups(self, group_id, **kwargs):  # noqa: E501
        """List conferences  # noqa: E501

        Retrieve the paginated list of conferences for this context  This API returns a JSON object containing the list of conferences, the key for the list of conferences is \"conferences\"  # noqa: E501
        This method makes a synchronous HTTP request by default. To make an
        asynchronous HTTP request, please pass async_req=True
        >>> thread = api.list_conferences_groups(group_id, async_req=True)
        >>> result = thread.get()

        :param async_req bool
        :param str group_id: ID (required)
        :return: list[Conference]
                 If the method is called asynchronously,
                 returns the request thread.
        """
        kwargs['_return_http_data_only'] = True
        if kwargs.get('async_req'):
            return self.list_conferences_groups_with_http_info(group_id, **kwargs)  # noqa: E501
        else:
            (data) = self.list_conferences_groups_with_http_info(group_id, **kwargs)  # noqa: E501
            return data

    def list_conferences_groups_with_http_info(self, group_id, **kwargs):  # noqa: E501
        """List conferences  # noqa: E501

        Retrieve the paginated list of conferences for this context  This API returns a JSON object containing the list of conferences, the key for the list of conferences is \"conferences\"  # noqa: E501
        This method makes a synchronous HTTP request by default. To make an
        asynchronous HTTP request, please pass async_req=True
        >>> thread = api.list_conferences_groups_with_http_info(group_id, async_req=True)
        >>> result = thread.get()

        :param async_req bool
        :param str group_id: ID (required)
        :return: list[Conference]
                 If the method is called asynchronously,
                 returns the request thread.
        """

        all_params = ['group_id']  # noqa: E501
        all_params.append('async_req')
        all_params.append('_return_http_data_only')
        all_params.append('_preload_content')
        all_params.append('_request_timeout')

        params = locals()
        for key, val in six.iteritems(params['kwargs']):
            if key not in all_params:
                raise TypeError(
                    "Got an unexpected keyword argument '%s'"
                    " to method list_conferences_groups" % key
                )
            params[key] = val
        del params['kwargs']
        # verify the required parameter 'group_id' is set
        if self.api_client.client_side_validation and ('group_id' not in params or
                                                       params['group_id'] is None):  # noqa: E501
            raise ValueError("Missing the required parameter `group_id` when calling `list_conferences_groups`")  # noqa: E501

        collection_formats = {}

        path_params = {}
        if 'group_id' in params:
            path_params['group_id'] = params['group_id']  # noqa: E501

        query_params = []

        header_params = {}

        form_params = []
        local_var_files = {}

        body_params = None
        # HTTP header `Accept`
        header_params['Accept'] = self.api_client.select_header_accept(
            ['application/json'])  # noqa: E501

        # Authentication setting
        auth_settings = []  # noqa: E501

        return self.api_client.call_api(
            '/v1/groups/{group_id}/conferences', 'GET',
            path_params,
            query_params,
            header_params,
            body=body_params,
            post_params=form_params,
            files=local_var_files,
            response_type='list[Conference]',  # noqa: E501
            auth_settings=auth_settings,
            async_req=params.get('async_req'),
            _return_http_data_only=params.get('_return_http_data_only'),
            _preload_content=params.get('_preload_content', True),
            _request_timeout=params.get('_request_timeout'),
            collection_formats=collection_formats)
