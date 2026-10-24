// GENERATED CODE! DO NOT MODIFY BY HAND!
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) =>
  function __require() {
    try {
      return (
        mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
        mod.exports
      );
    } catch (e) {
      throw ((mod = 0), e);
    }
  };

// ../../node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  '../../node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js'(exports) {
    'use strict';
    Object.defineProperty(exports, '__esModule', { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320) pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  },
});

// <stdin>
var request0Params = validate21;
var schema9 = {
  description: 'Client-declared capabilities negotiated during initialize.',
  properties: {
    experimentalApi: {
      default: false,
      description: 'Opt into receiving experimental API methods and fields.',
      type: 'boolean',
    },
    explicitGatewayOauth: {
      description:
        "Use explicit gateway OAuth login instead of automatic browser authorization. Applies to this app-server's gateway runtime; later connections cannot undo it.",
      type: 'boolean',
    },
    extensions: {
      additionalProperties: true,
      description: 'MCP extension settings declared by the app-server client.',
      type: ['object', 'null'],
    },
    mcpServerOpenaiFormElicitation: {
      description:
        'Legacy opt-in for the `openai/form` MCP extension.\n\nNew clients should declare `openai/form` in [`Self::extensions`].',
      type: 'boolean',
    },
    optOutNotificationMethods: {
      description:
        'Exact notification method names that should be suppressed for this connection (for example `thread/started`).',
      items: { type: 'string' },
      type: ['array', 'null'],
    },
    requestAttestation: {
      default: false,
      description: 'Opt into `attestation/generate` requests for upstream `x-oai-attestation`.',
      type: 'boolean',
    },
  },
  type: 'object',
};
function validate24(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.experimentalApi !== void 0) {
        const _errs1 = errors;
        if (typeof data.experimentalApi !== 'boolean') {
          validate24.errors = [
            {
              instancePath: instancePath + '/experimentalApi',
              schemaPath: '#/properties/experimentalApi/type',
              keyword: 'type',
              params: { type: 'boolean' },
              message: 'must be boolean',
            },
          ];
          return false;
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.explicitGatewayOauth !== void 0) {
          const _errs3 = errors;
          if (typeof data.explicitGatewayOauth !== 'boolean') {
            validate24.errors = [
              {
                instancePath: instancePath + '/explicitGatewayOauth',
                schemaPath: '#/properties/explicitGatewayOauth/type',
                keyword: 'type',
                params: { type: 'boolean' },
                message: 'must be boolean',
              },
            ];
            return false;
          }
          var valid0 = _errs3 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.extensions !== void 0) {
            let data2 = data.extensions;
            const _errs5 = errors;
            if (!(data2 && typeof data2 == 'object' && !Array.isArray(data2)) && data2 !== null) {
              validate24.errors = [
                {
                  instancePath: instancePath + '/extensions',
                  schemaPath: '#/properties/extensions/type',
                  keyword: 'type',
                  params: { type: schema9.properties.extensions.type },
                  message: 'must be object,null',
                },
              ];
              return false;
            }
            var valid0 = _errs5 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.mcpServerOpenaiFormElicitation !== void 0) {
              const _errs8 = errors;
              if (typeof data.mcpServerOpenaiFormElicitation !== 'boolean') {
                validate24.errors = [
                  {
                    instancePath: instancePath + '/mcpServerOpenaiFormElicitation',
                    schemaPath: '#/properties/mcpServerOpenaiFormElicitation/type',
                    keyword: 'type',
                    params: { type: 'boolean' },
                    message: 'must be boolean',
                  },
                ];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.optOutNotificationMethods !== void 0) {
                let data4 = data.optOutNotificationMethods;
                const _errs10 = errors;
                if (!Array.isArray(data4) && data4 !== null) {
                  validate24.errors = [
                    {
                      instancePath: instancePath + '/optOutNotificationMethods',
                      schemaPath: '#/properties/optOutNotificationMethods/type',
                      keyword: 'type',
                      params: { type: schema9.properties.optOutNotificationMethods.type },
                      message: 'must be array,null',
                    },
                  ];
                  return false;
                }
                if (errors === _errs10) {
                  if (Array.isArray(data4)) {
                    var valid1 = true;
                    const len0 = data4.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      const _errs12 = errors;
                      if (typeof data4[i0] !== 'string') {
                        validate24.errors = [
                          {
                            instancePath: instancePath + '/optOutNotificationMethods/' + i0,
                            schemaPath: '#/properties/optOutNotificationMethods/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          },
                        ];
                        return false;
                      }
                      var valid1 = _errs12 === errors;
                      if (!valid1) {
                        break;
                      }
                    }
                  }
                }
                var valid0 = _errs10 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.requestAttestation !== void 0) {
                  const _errs14 = errors;
                  if (typeof data.requestAttestation !== 'boolean') {
                    validate24.errors = [
                      {
                        instancePath: instancePath + '/requestAttestation',
                        schemaPath: '#/properties/requestAttestation/type',
                        keyword: 'type',
                        params: { type: 'boolean' },
                        message: 'must be boolean',
                      },
                    ];
                    return false;
                  }
                  var valid0 = _errs14 === errors;
                } else {
                  var valid0 = true;
                }
              }
            }
          }
        }
      }
    } else {
      validate24.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate24.errors = vErrors;
  return errors === 0;
}
var schema10 = {
  properties: {
    name: { type: 'string' },
    title: { type: ['string', 'null'] },
    version: { type: 'string' },
  },
  required: ['name', 'version'],
  type: 'object',
};
function validate26(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.name === void 0 && (missing0 = 'name')) ||
        (data.version === void 0 && (missing0 = 'version'))
      ) {
        validate26.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.name !== void 0) {
          const _errs1 = errors;
          if (typeof data.name !== 'string') {
            validate26.errors = [
              {
                instancePath: instancePath + '/name',
                schemaPath: '#/properties/name/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.title !== void 0) {
            let data1 = data.title;
            const _errs3 = errors;
            if (typeof data1 !== 'string' && data1 !== null) {
              validate26.errors = [
                {
                  instancePath: instancePath + '/title',
                  schemaPath: '#/properties/title/type',
                  keyword: 'type',
                  params: { type: schema10.properties.title.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.version !== void 0) {
              const _errs5 = errors;
              if (typeof data.version !== 'string') {
                validate26.errors = [
                  {
                    instancePath: instancePath + '/version',
                    schemaPath: '#/properties/version/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate26.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate26.errors = vErrors;
  return errors === 0;
}
function validate23(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.clientInfo === void 0 && (missing0 = 'clientInfo')) {
        validate23.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.capabilities !== void 0) {
          let data0 = data.capabilities;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          if (
            !validate24(data0, {
              instancePath: instancePath + '/capabilities',
              parentData: data,
              parentDataProperty: 'capabilities',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs4 = errors;
            if (data0 !== null) {
              const err0 = {
                instancePath: instancePath + '/capabilities',
                schemaPath: '#/properties/capabilities/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
            var _valid0 = _errs4 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err1 = {
              instancePath: instancePath + '/capabilities',
              schemaPath: '#/properties/capabilities/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate23.errors = vErrors;
            return false;
          } else {
            errors = _errs2;
            if (vErrors !== null) {
              if (_errs2) {
                vErrors.length = _errs2;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.clientInfo !== void 0) {
            const _errs6 = errors;
            if (
              !validate26(data.clientInfo, {
                instancePath: instancePath + '/clientInfo',
                parentData: data,
                parentDataProperty: 'clientInfo',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs6 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate23.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate23.errors = vErrors;
  return errors === 0;
}
function validate21(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate23(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
    errors = vErrors.length;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
var request0Result = validate29;
function validate31(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate31.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  validate31.errors = vErrors;
  return errors === 0;
}
function validate30(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.codexHome === void 0 && (missing0 = 'codexHome')) ||
        (data.platformFamily === void 0 && (missing0 = 'platformFamily')) ||
        (data.platformOs === void 0 && (missing0 = 'platformOs')) ||
        (data.userAgent === void 0 && (missing0 = 'userAgent'))
      ) {
        validate30.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.codexHome !== void 0) {
          const _errs1 = errors;
          if (
            !validate31(data.codexHome, {
              instancePath: instancePath + '/codexHome',
              parentData: data,
              parentDataProperty: 'codexHome',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.platformFamily !== void 0) {
            const _errs3 = errors;
            if (typeof data.platformFamily !== 'string') {
              validate30.errors = [
                {
                  instancePath: instancePath + '/platformFamily',
                  schemaPath: '#/properties/platformFamily/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.platformOs !== void 0) {
              const _errs5 = errors;
              if (typeof data.platformOs !== 'string') {
                validate30.errors = [
                  {
                    instancePath: instancePath + '/platformOs',
                    schemaPath: '#/properties/platformOs/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.userAgent !== void 0) {
                const _errs7 = errors;
                if (typeof data.userAgent !== 'string') {
                  validate30.errors = [
                    {
                      instancePath: instancePath + '/userAgent',
                      schemaPath: '#/properties/userAgent/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate30.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate30.errors = vErrors;
  return errors === 0;
}
function validate29(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate30(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
    errors = vErrors.length;
  }
  validate29.errors = vErrors;
  return errors === 0;
}
var request1Params = validate34;
var schema15 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    approvalPolicy: { anyOf: [{ $ref: '#/definitions/v2/AskForApproval' }, { type: 'null' }] },
    approvalsReviewer: {
      anyOf: [{ $ref: '#/definitions/v2/ApprovalsReviewer' }, { type: 'null' }],
      description:
        'Override where approval requests are routed for review on this thread and subsequent turns.',
    },
    baseInstructions: { type: ['string', 'null'] },
    config: { additionalProperties: true, type: ['object', 'null'] },
    cwd: { type: ['string', 'null'] },
    developerInstructions: { type: ['string', 'null'] },
    ephemeral: { type: ['boolean', 'null'] },
    model: { type: ['string', 'null'] },
    modelProvider: { type: ['string', 'null'] },
    personality: {
      anyOf: [{ $ref: '#/definitions/v2/Personality' }, { type: 'null' }],
      description: '@deprecated `friendly` and `pragmatic` no longer select a style.',
    },
    sandbox: { anyOf: [{ $ref: '#/definitions/v2/SandboxMode' }, { type: 'null' }] },
    serviceName: { type: ['string', 'null'] },
    serviceTier: { type: ['string', 'null'] },
    sessionStartSource: {
      anyOf: [{ $ref: '#/definitions/v2/ThreadStartSource' }, { type: 'null' }],
    },
    threadSource: {
      anyOf: [{ $ref: '#/definitions/v2/ThreadSource' }, { type: 'null' }],
      description: 'Optional client-supplied analytics source classification for this thread.',
    },
  },
  title: 'ThreadStartParams',
  type: 'object',
};
var schema16 = {
  oneOf: [
    { enum: ['untrusted', 'on-request', 'never'], type: 'string' },
    {
      additionalProperties: false,
      properties: {
        granular: {
          properties: {
            mcp_elicitations: { type: 'boolean' },
            request_permissions: { default: false, type: 'boolean' },
            rules: { type: 'boolean' },
            sandbox_approval: { type: 'boolean' },
            skill_approval: { default: false, type: 'boolean' },
          },
          required: ['mcp_elicitations', 'rules', 'sandbox_approval'],
          type: 'object',
        },
      },
      required: ['granular'],
      title: 'GranularAskForApproval',
      type: 'object',
    },
  ],
};
function validate36(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === 'untrusted' || data === 'on-request' || data === 'never')) {
    const err1 = {
      instancePath,
      schemaPath: '#/oneOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema16.oneOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (errors === _errs3) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.granular === void 0 && (missing0 = 'granular')) {
        const err2 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      } else {
        const _errs5 = errors;
        for (const key0 in data) {
          if (!(key0 === 'granular')) {
            const err3 = {
              instancePath,
              schemaPath: '#/oneOf/1/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key0 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            break;
          }
        }
        if (_errs5 === errors) {
          if (data.granular !== void 0) {
            let data0 = data.granular;
            const _errs6 = errors;
            if (errors === _errs6) {
              if (data0 && typeof data0 == 'object' && !Array.isArray(data0)) {
                let missing1;
                if (
                  (data0.mcp_elicitations === void 0 && (missing1 = 'mcp_elicitations')) ||
                  (data0.rules === void 0 && (missing1 = 'rules')) ||
                  (data0.sandbox_approval === void 0 && (missing1 = 'sandbox_approval'))
                ) {
                  const err4 = {
                    instancePath: instancePath + '/granular',
                    schemaPath: '#/oneOf/1/properties/granular/required',
                    keyword: 'required',
                    params: { missingProperty: missing1 },
                    message: "must have required property '" + missing1 + "'",
                  };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                } else {
                  if (data0.mcp_elicitations !== void 0) {
                    const _errs8 = errors;
                    if (typeof data0.mcp_elicitations !== 'boolean') {
                      const err5 = {
                        instancePath: instancePath + '/granular/mcp_elicitations',
                        schemaPath:
                          '#/oneOf/1/properties/granular/properties/mcp_elicitations/type',
                        keyword: 'type',
                        params: { type: 'boolean' },
                        message: 'must be boolean',
                      };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    }
                    var valid2 = _errs8 === errors;
                  } else {
                    var valid2 = true;
                  }
                  if (valid2) {
                    if (data0.request_permissions !== void 0) {
                      const _errs10 = errors;
                      if (typeof data0.request_permissions !== 'boolean') {
                        const err6 = {
                          instancePath: instancePath + '/granular/request_permissions',
                          schemaPath:
                            '#/oneOf/1/properties/granular/properties/request_permissions/type',
                          keyword: 'type',
                          params: { type: 'boolean' },
                          message: 'must be boolean',
                        };
                        if (vErrors === null) {
                          vErrors = [err6];
                        } else {
                          vErrors.push(err6);
                        }
                        errors++;
                      }
                      var valid2 = _errs10 === errors;
                    } else {
                      var valid2 = true;
                    }
                    if (valid2) {
                      if (data0.rules !== void 0) {
                        const _errs12 = errors;
                        if (typeof data0.rules !== 'boolean') {
                          const err7 = {
                            instancePath: instancePath + '/granular/rules',
                            schemaPath: '#/oneOf/1/properties/granular/properties/rules/type',
                            keyword: 'type',
                            params: { type: 'boolean' },
                            message: 'must be boolean',
                          };
                          if (vErrors === null) {
                            vErrors = [err7];
                          } else {
                            vErrors.push(err7);
                          }
                          errors++;
                        }
                        var valid2 = _errs12 === errors;
                      } else {
                        var valid2 = true;
                      }
                      if (valid2) {
                        if (data0.sandbox_approval !== void 0) {
                          const _errs14 = errors;
                          if (typeof data0.sandbox_approval !== 'boolean') {
                            const err8 = {
                              instancePath: instancePath + '/granular/sandbox_approval',
                              schemaPath:
                                '#/oneOf/1/properties/granular/properties/sandbox_approval/type',
                              keyword: 'type',
                              params: { type: 'boolean' },
                              message: 'must be boolean',
                            };
                            if (vErrors === null) {
                              vErrors = [err8];
                            } else {
                              vErrors.push(err8);
                            }
                            errors++;
                          }
                          var valid2 = _errs14 === errors;
                        } else {
                          var valid2 = true;
                        }
                        if (valid2) {
                          if (data0.skill_approval !== void 0) {
                            const _errs16 = errors;
                            if (typeof data0.skill_approval !== 'boolean') {
                              const err9 = {
                                instancePath: instancePath + '/granular/skill_approval',
                                schemaPath:
                                  '#/oneOf/1/properties/granular/properties/skill_approval/type',
                                keyword: 'type',
                                params: { type: 'boolean' },
                                message: 'must be boolean',
                              };
                              if (vErrors === null) {
                                vErrors = [err9];
                              } else {
                                vErrors.push(err9);
                              }
                              errors++;
                            }
                            var valid2 = _errs16 === errors;
                          } else {
                            var valid2 = true;
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                const err10 = {
                  instancePath: instancePath + '/granular',
                  schemaPath: '#/oneOf/1/properties/granular/type',
                  keyword: 'type',
                  params: { type: 'object' },
                  message: 'must be object',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
          }
        }
      }
    } else {
      const err11 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err12 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
    validate36.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate36.errors = vErrors;
  return errors === 0;
}
var schema17 = {
  description:
    'Configures who approval requests are routed to for review. Examples include sandbox escapes, blocked network access, MCP approval prompts, and ARC escalations. Defaults to `user`. `auto_review` uses a carefully prompted subagent to gather relevant context and apply a risk-based decision framework before approving or denying the request. The legacy value `guardian_subagent` is accepted for compatibility.',
  enum: ['user', 'auto_review', 'guardian_subagent'],
  type: 'string',
};
function validate38(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate38.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'user' || data === 'auto_review' || data === 'guardian_subagent')) {
    validate38.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema17.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate38.errors = vErrors;
  return errors === 0;
}
var schema18 = {
  description: 'Deprecated: `friendly` and `pragmatic` no longer select a style.',
  enum: ['none', 'friendly', 'pragmatic'],
  type: 'string',
};
function validate40(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate40.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'none' || data === 'friendly' || data === 'pragmatic')) {
    validate40.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema18.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate40.errors = vErrors;
  return errors === 0;
}
var schema19 = { enum: ['read-only', 'workspace-write', 'danger-full-access'], type: 'string' };
function validate42(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate42.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'read-only' || data === 'workspace-write' || data === 'danger-full-access')) {
    validate42.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema19.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate42.errors = vErrors;
  return errors === 0;
}
var schema20 = { enum: ['startup', 'clear'], type: 'string' };
function validate44(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate44.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'startup' || data === 'clear')) {
    validate44.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema20.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate44.errors = vErrors;
  return errors === 0;
}
function validate46(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate46.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  validate46.errors = vErrors;
  return errors === 0;
}
function validate35(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.approvalPolicy !== void 0) {
        let data0 = data.approvalPolicy;
        const _errs1 = errors;
        const _errs2 = errors;
        let valid1 = false;
        const _errs3 = errors;
        if (
          !validate36(data0, {
            instancePath: instancePath + '/approvalPolicy',
            parentData: data,
            parentDataProperty: 'approvalPolicy',
            rootData,
          })
        ) {
          vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs3 === errors;
        valid1 = valid1 || _valid0;
        if (!valid1) {
          const _errs4 = errors;
          if (data0 !== null) {
            const err0 = {
              instancePath: instancePath + '/approvalPolicy',
              schemaPath: '#/properties/approvalPolicy/anyOf/1/type',
              keyword: 'type',
              params: { type: 'null' },
              message: 'must be null',
            };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
          var _valid0 = _errs4 === errors;
          valid1 = valid1 || _valid0;
        }
        if (!valid1) {
          const err1 = {
            instancePath: instancePath + '/approvalPolicy',
            schemaPath: '#/properties/approvalPolicy/anyOf',
            keyword: 'anyOf',
            params: {},
            message: 'must match a schema in anyOf',
          };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
          validate35.errors = vErrors;
          return false;
        } else {
          errors = _errs2;
          if (vErrors !== null) {
            if (_errs2) {
              vErrors.length = _errs2;
            } else {
              vErrors = null;
            }
          }
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.approvalsReviewer !== void 0) {
          let data1 = data.approvalsReviewer;
          const _errs6 = errors;
          const _errs7 = errors;
          let valid2 = false;
          const _errs8 = errors;
          if (
            !validate38(data1, {
              instancePath: instancePath + '/approvalsReviewer',
              parentData: data,
              parentDataProperty: 'approvalsReviewer',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
            errors = vErrors.length;
          }
          var _valid1 = _errs8 === errors;
          valid2 = valid2 || _valid1;
          if (!valid2) {
            const _errs9 = errors;
            if (data1 !== null) {
              const err2 = {
                instancePath: instancePath + '/approvalsReviewer',
                schemaPath: '#/properties/approvalsReviewer/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            var _valid1 = _errs9 === errors;
            valid2 = valid2 || _valid1;
          }
          if (!valid2) {
            const err3 = {
              instancePath: instancePath + '/approvalsReviewer',
              schemaPath: '#/properties/approvalsReviewer/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            validate35.errors = vErrors;
            return false;
          } else {
            errors = _errs7;
            if (vErrors !== null) {
              if (_errs7) {
                vErrors.length = _errs7;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs6 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.baseInstructions !== void 0) {
            let data2 = data.baseInstructions;
            const _errs11 = errors;
            if (typeof data2 !== 'string' && data2 !== null) {
              validate35.errors = [
                {
                  instancePath: instancePath + '/baseInstructions',
                  schemaPath: '#/properties/baseInstructions/type',
                  keyword: 'type',
                  params: { type: schema15.properties.baseInstructions.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs11 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.config !== void 0) {
              let data3 = data.config;
              const _errs13 = errors;
              if (!(data3 && typeof data3 == 'object' && !Array.isArray(data3)) && data3 !== null) {
                validate35.errors = [
                  {
                    instancePath: instancePath + '/config',
                    schemaPath: '#/properties/config/type',
                    keyword: 'type',
                    params: { type: schema15.properties.config.type },
                    message: 'must be object,null',
                  },
                ];
                return false;
              }
              var valid0 = _errs13 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.cwd !== void 0) {
                let data4 = data.cwd;
                const _errs16 = errors;
                if (typeof data4 !== 'string' && data4 !== null) {
                  validate35.errors = [
                    {
                      instancePath: instancePath + '/cwd',
                      schemaPath: '#/properties/cwd/type',
                      keyword: 'type',
                      params: { type: schema15.properties.cwd.type },
                      message: 'must be string,null',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs16 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.developerInstructions !== void 0) {
                  let data5 = data.developerInstructions;
                  const _errs18 = errors;
                  if (typeof data5 !== 'string' && data5 !== null) {
                    validate35.errors = [
                      {
                        instancePath: instancePath + '/developerInstructions',
                        schemaPath: '#/properties/developerInstructions/type',
                        keyword: 'type',
                        params: { type: schema15.properties.developerInstructions.type },
                        message: 'must be string,null',
                      },
                    ];
                    return false;
                  }
                  var valid0 = _errs18 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.ephemeral !== void 0) {
                    let data6 = data.ephemeral;
                    const _errs20 = errors;
                    if (typeof data6 !== 'boolean' && data6 !== null) {
                      validate35.errors = [
                        {
                          instancePath: instancePath + '/ephemeral',
                          schemaPath: '#/properties/ephemeral/type',
                          keyword: 'type',
                          params: { type: schema15.properties.ephemeral.type },
                          message: 'must be boolean,null',
                        },
                      ];
                      return false;
                    }
                    var valid0 = _errs20 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.model !== void 0) {
                      let data7 = data.model;
                      const _errs22 = errors;
                      if (typeof data7 !== 'string' && data7 !== null) {
                        validate35.errors = [
                          {
                            instancePath: instancePath + '/model',
                            schemaPath: '#/properties/model/type',
                            keyword: 'type',
                            params: { type: schema15.properties.model.type },
                            message: 'must be string,null',
                          },
                        ];
                        return false;
                      }
                      var valid0 = _errs22 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.modelProvider !== void 0) {
                        let data8 = data.modelProvider;
                        const _errs24 = errors;
                        if (typeof data8 !== 'string' && data8 !== null) {
                          validate35.errors = [
                            {
                              instancePath: instancePath + '/modelProvider',
                              schemaPath: '#/properties/modelProvider/type',
                              keyword: 'type',
                              params: { type: schema15.properties.modelProvider.type },
                              message: 'must be string,null',
                            },
                          ];
                          return false;
                        }
                        var valid0 = _errs24 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.personality !== void 0) {
                          let data9 = data.personality;
                          const _errs26 = errors;
                          const _errs27 = errors;
                          let valid3 = false;
                          const _errs28 = errors;
                          if (
                            !validate40(data9, {
                              instancePath: instancePath + '/personality',
                              parentData: data,
                              parentDataProperty: 'personality',
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate40.errors
                                : vErrors.concat(validate40.errors);
                            errors = vErrors.length;
                          }
                          var _valid2 = _errs28 === errors;
                          valid3 = valid3 || _valid2;
                          if (!valid3) {
                            const _errs29 = errors;
                            if (data9 !== null) {
                              const err4 = {
                                instancePath: instancePath + '/personality',
                                schemaPath: '#/properties/personality/anyOf/1/type',
                                keyword: 'type',
                                params: { type: 'null' },
                                message: 'must be null',
                              };
                              if (vErrors === null) {
                                vErrors = [err4];
                              } else {
                                vErrors.push(err4);
                              }
                              errors++;
                            }
                            var _valid2 = _errs29 === errors;
                            valid3 = valid3 || _valid2;
                          }
                          if (!valid3) {
                            const err5 = {
                              instancePath: instancePath + '/personality',
                              schemaPath: '#/properties/personality/anyOf',
                              keyword: 'anyOf',
                              params: {},
                              message: 'must match a schema in anyOf',
                            };
                            if (vErrors === null) {
                              vErrors = [err5];
                            } else {
                              vErrors.push(err5);
                            }
                            errors++;
                            validate35.errors = vErrors;
                            return false;
                          } else {
                            errors = _errs27;
                            if (vErrors !== null) {
                              if (_errs27) {
                                vErrors.length = _errs27;
                              } else {
                                vErrors = null;
                              }
                            }
                          }
                          var valid0 = _errs26 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.sandbox !== void 0) {
                            let data10 = data.sandbox;
                            const _errs31 = errors;
                            const _errs32 = errors;
                            let valid4 = false;
                            const _errs33 = errors;
                            if (
                              !validate42(data10, {
                                instancePath: instancePath + '/sandbox',
                                parentData: data,
                                parentDataProperty: 'sandbox',
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate42.errors
                                  : vErrors.concat(validate42.errors);
                              errors = vErrors.length;
                            }
                            var _valid3 = _errs33 === errors;
                            valid4 = valid4 || _valid3;
                            if (!valid4) {
                              const _errs34 = errors;
                              if (data10 !== null) {
                                const err6 = {
                                  instancePath: instancePath + '/sandbox',
                                  schemaPath: '#/properties/sandbox/anyOf/1/type',
                                  keyword: 'type',
                                  params: { type: 'null' },
                                  message: 'must be null',
                                };
                                if (vErrors === null) {
                                  vErrors = [err6];
                                } else {
                                  vErrors.push(err6);
                                }
                                errors++;
                              }
                              var _valid3 = _errs34 === errors;
                              valid4 = valid4 || _valid3;
                            }
                            if (!valid4) {
                              const err7 = {
                                instancePath: instancePath + '/sandbox',
                                schemaPath: '#/properties/sandbox/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                              };
                              if (vErrors === null) {
                                vErrors = [err7];
                              } else {
                                vErrors.push(err7);
                              }
                              errors++;
                              validate35.errors = vErrors;
                              return false;
                            } else {
                              errors = _errs32;
                              if (vErrors !== null) {
                                if (_errs32) {
                                  vErrors.length = _errs32;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid0 = _errs31 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.serviceName !== void 0) {
                              let data11 = data.serviceName;
                              const _errs36 = errors;
                              if (typeof data11 !== 'string' && data11 !== null) {
                                validate35.errors = [
                                  {
                                    instancePath: instancePath + '/serviceName',
                                    schemaPath: '#/properties/serviceName/type',
                                    keyword: 'type',
                                    params: { type: schema15.properties.serviceName.type },
                                    message: 'must be string,null',
                                  },
                                ];
                                return false;
                              }
                              var valid0 = _errs36 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.serviceTier !== void 0) {
                                let data12 = data.serviceTier;
                                const _errs38 = errors;
                                if (typeof data12 !== 'string' && data12 !== null) {
                                  validate35.errors = [
                                    {
                                      instancePath: instancePath + '/serviceTier',
                                      schemaPath: '#/properties/serviceTier/type',
                                      keyword: 'type',
                                      params: { type: schema15.properties.serviceTier.type },
                                      message: 'must be string,null',
                                    },
                                  ];
                                  return false;
                                }
                                var valid0 = _errs38 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.sessionStartSource !== void 0) {
                                  let data13 = data.sessionStartSource;
                                  const _errs40 = errors;
                                  const _errs41 = errors;
                                  let valid5 = false;
                                  const _errs42 = errors;
                                  if (
                                    !validate44(data13, {
                                      instancePath: instancePath + '/sessionStartSource',
                                      parentData: data,
                                      parentDataProperty: 'sessionStartSource',
                                      rootData,
                                    })
                                  ) {
                                    vErrors =
                                      vErrors === null
                                        ? validate44.errors
                                        : vErrors.concat(validate44.errors);
                                    errors = vErrors.length;
                                  }
                                  var _valid4 = _errs42 === errors;
                                  valid5 = valid5 || _valid4;
                                  if (!valid5) {
                                    const _errs43 = errors;
                                    if (data13 !== null) {
                                      const err8 = {
                                        instancePath: instancePath + '/sessionStartSource',
                                        schemaPath: '#/properties/sessionStartSource/anyOf/1/type',
                                        keyword: 'type',
                                        params: { type: 'null' },
                                        message: 'must be null',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err8];
                                      } else {
                                        vErrors.push(err8);
                                      }
                                      errors++;
                                    }
                                    var _valid4 = _errs43 === errors;
                                    valid5 = valid5 || _valid4;
                                  }
                                  if (!valid5) {
                                    const err9 = {
                                      instancePath: instancePath + '/sessionStartSource',
                                      schemaPath: '#/properties/sessionStartSource/anyOf',
                                      keyword: 'anyOf',
                                      params: {},
                                      message: 'must match a schema in anyOf',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err9];
                                    } else {
                                      vErrors.push(err9);
                                    }
                                    errors++;
                                    validate35.errors = vErrors;
                                    return false;
                                  } else {
                                    errors = _errs41;
                                    if (vErrors !== null) {
                                      if (_errs41) {
                                        vErrors.length = _errs41;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var valid0 = _errs40 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.threadSource !== void 0) {
                                    let data14 = data.threadSource;
                                    const _errs45 = errors;
                                    const _errs46 = errors;
                                    let valid6 = false;
                                    const _errs47 = errors;
                                    if (
                                      !validate46(data14, {
                                        instancePath: instancePath + '/threadSource',
                                        parentData: data,
                                        parentDataProperty: 'threadSource',
                                        rootData,
                                      })
                                    ) {
                                      vErrors =
                                        vErrors === null
                                          ? validate46.errors
                                          : vErrors.concat(validate46.errors);
                                      errors = vErrors.length;
                                    }
                                    var _valid5 = _errs47 === errors;
                                    valid6 = valid6 || _valid5;
                                    if (!valid6) {
                                      const _errs48 = errors;
                                      if (data14 !== null) {
                                        const err10 = {
                                          instancePath: instancePath + '/threadSource',
                                          schemaPath: '#/properties/threadSource/anyOf/1/type',
                                          keyword: 'type',
                                          params: { type: 'null' },
                                          message: 'must be null',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err10];
                                        } else {
                                          vErrors.push(err10);
                                        }
                                        errors++;
                                      }
                                      var _valid5 = _errs48 === errors;
                                      valid6 = valid6 || _valid5;
                                    }
                                    if (!valid6) {
                                      const err11 = {
                                        instancePath: instancePath + '/threadSource',
                                        schemaPath: '#/properties/threadSource/anyOf',
                                        keyword: 'anyOf',
                                        params: {},
                                        message: 'must match a schema in anyOf',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err11];
                                      } else {
                                        vErrors.push(err11);
                                      }
                                      errors++;
                                      validate35.errors = vErrors;
                                      return false;
                                    } else {
                                      errors = _errs46;
                                      if (vErrors !== null) {
                                        if (_errs46) {
                                          vErrors.length = _errs46;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var valid0 = _errs45 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate35.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate35.errors = vErrors;
  return errors === 0;
}
function validate34(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate35(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
    errors = vErrors.length;
  }
  validate34.errors = vErrors;
  return errors === 0;
}
var request1Result = validate49;
var schema23 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    approvalPolicy: { $ref: '#/definitions/v2/AskForApproval' },
    approvalsReviewer: {
      allOf: [{ $ref: '#/definitions/v2/ApprovalsReviewer' }],
      description: 'Reviewer currently used for approval requests on this thread.',
    },
    cwd: { $ref: '#/definitions/v2/AbsolutePathBuf' },
    disabledPluginIds: {
      default: [],
      description: 'Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.',
      items: { type: 'string' },
      type: 'array',
    },
    instructionSources: {
      default: [],
      description:
        'Environment-native paths to instruction source files currently loaded for this thread.',
      items: { $ref: '#/definitions/v2/LegacyAppPathString' },
      type: 'array',
    },
    model: { type: 'string' },
    modelProvider: { type: 'string' },
    reasoningEffort: { anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }] },
    sandbox: {
      allOf: [{ $ref: '#/definitions/v2/SandboxPolicy' }],
      description:
        'Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance.',
    },
    serviceTier: { type: ['string', 'null'] },
    thread: { $ref: '#/definitions/v2/Thread' },
  },
  required: [
    'approvalPolicy',
    'approvalsReviewer',
    'cwd',
    'model',
    'modelProvider',
    'sandbox',
    'thread',
  ],
  title: 'ThreadStartResponse',
  type: 'object',
};
function validate54(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate54.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  validate54.errors = vErrors;
  return errors === 0;
}
var func2 = require_ucs2length().default;
function validate56(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (typeof data === 'string') {
      if (func2(data) < 1) {
        validate56.errors = [
          {
            instancePath,
            schemaPath: '#/minLength',
            keyword: 'minLength',
            params: { limit: 1 },
            message: 'must NOT have fewer than 1 characters',
          },
        ];
        return false;
      }
    } else {
      validate56.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'string' },
          message: 'must be string',
        },
      ];
      return false;
    }
  }
  validate56.errors = vErrors;
  return errors === 0;
}
var schema26 = {
  oneOf: [
    {
      properties: {
        type: {
          enum: ['dangerFullAccess'],
          title: 'DangerFullAccessSandboxPolicyType',
          type: 'string',
        },
      },
      required: ['type'],
      title: 'DangerFullAccessSandboxPolicy',
      type: 'object',
    },
    {
      properties: {
        networkAccess: { default: false, type: 'boolean' },
        type: { enum: ['readOnly'], title: 'ReadOnlySandboxPolicyType', type: 'string' },
      },
      required: ['type'],
      title: 'ReadOnlySandboxPolicy',
      type: 'object',
    },
    {
      properties: {
        networkAccess: {
          allOf: [{ $ref: '#/definitions/v2/NetworkAccess' }],
          default: 'restricted',
        },
        type: {
          enum: ['externalSandbox'],
          title: 'ExternalSandboxSandboxPolicyType',
          type: 'string',
        },
      },
      required: ['type'],
      title: 'ExternalSandboxSandboxPolicy',
      type: 'object',
    },
    {
      properties: {
        excludeSlashTmp: { default: false, type: 'boolean' },
        excludeTmpdirEnvVar: { default: false, type: 'boolean' },
        networkAccess: { default: false, type: 'boolean' },
        type: {
          enum: ['workspaceWrite'],
          title: 'WorkspaceWriteSandboxPolicyType',
          type: 'string',
        },
        writableRoots: {
          default: [],
          items: { $ref: '#/definitions/v2/AbsolutePathBuf' },
          type: 'array',
        },
      },
      required: ['type'],
      title: 'WorkspaceWriteSandboxPolicy',
      type: 'object',
    },
  ],
};
var schema27 = { enum: ['restricted', 'enabled'], type: 'string' };
function validate59(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate59.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'restricted' || data === 'enabled')) {
    validate59.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema27.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate59.errors = vErrors;
  return errors === 0;
}
function validate58(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = 'type')) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== 'string') {
            const err1 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/0/properties/type/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          if (!(data0 === 'dangerFullAccess')) {
            const err2 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/0/properties/type/enum',
              keyword: 'enum',
              params: { allowedValues: schema26.oneOf[0].properties.type.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
      }
    } else {
      const err3 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (errors === _errs5) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = 'type')) {
        const err4 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      } else {
        if (data.networkAccess !== void 0) {
          const _errs7 = errors;
          if (typeof data.networkAccess !== 'boolean') {
            const err5 = {
              instancePath: instancePath + '/networkAccess',
              schemaPath: '#/oneOf/1/properties/networkAccess/type',
              keyword: 'type',
              params: { type: 'boolean' },
              message: 'must be boolean',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          var valid2 = _errs7 === errors;
        } else {
          var valid2 = true;
        }
        if (valid2) {
          if (data.type !== void 0) {
            let data2 = data.type;
            const _errs9 = errors;
            if (typeof data2 !== 'string') {
              const err6 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (!(data2 === 'readOnly')) {
              const err7 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema26.oneOf[1].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            var valid2 = _errs9 === errors;
          } else {
            var valid2 = true;
          }
        }
      }
    } else {
      const err8 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs11 = errors;
    if (errors === _errs11) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.type === void 0 && (missing2 = 'type')) {
          const err9 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        } else {
          if (data.networkAccess !== void 0) {
            const _errs13 = errors;
            if (
              !validate59(data.networkAccess, {
                instancePath: instancePath + '/networkAccess',
                parentData: data,
                parentDataProperty: 'networkAccess',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
              errors = vErrors.length;
            }
            var valid3 = _errs13 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data4 = data.type;
              const _errs15 = errors;
              if (typeof data4 !== 'string') {
                const err10 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              if (!(data4 === 'externalSandbox')) {
                const err11 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema26.oneOf[2].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              var valid3 = _errs15 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      } else {
        const err12 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    var _valid0 = _errs11 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs17 = errors;
      if (errors === _errs17) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing3;
          if (data.type === void 0 && (missing3 = 'type')) {
            const err13 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing3 },
              message: "must have required property '" + missing3 + "'",
            };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          } else {
            if (data.excludeSlashTmp !== void 0) {
              const _errs19 = errors;
              if (typeof data.excludeSlashTmp !== 'boolean') {
                const err14 = {
                  instancePath: instancePath + '/excludeSlashTmp',
                  schemaPath: '#/oneOf/3/properties/excludeSlashTmp/type',
                  keyword: 'type',
                  params: { type: 'boolean' },
                  message: 'must be boolean',
                };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              var valid5 = _errs19 === errors;
            } else {
              var valid5 = true;
            }
            if (valid5) {
              if (data.excludeTmpdirEnvVar !== void 0) {
                const _errs21 = errors;
                if (typeof data.excludeTmpdirEnvVar !== 'boolean') {
                  const err15 = {
                    instancePath: instancePath + '/excludeTmpdirEnvVar',
                    schemaPath: '#/oneOf/3/properties/excludeTmpdirEnvVar/type',
                    keyword: 'type',
                    params: { type: 'boolean' },
                    message: 'must be boolean',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                var valid5 = _errs21 === errors;
              } else {
                var valid5 = true;
              }
              if (valid5) {
                if (data.networkAccess !== void 0) {
                  const _errs23 = errors;
                  if (typeof data.networkAccess !== 'boolean') {
                    const err16 = {
                      instancePath: instancePath + '/networkAccess',
                      schemaPath: '#/oneOf/3/properties/networkAccess/type',
                      keyword: 'type',
                      params: { type: 'boolean' },
                      message: 'must be boolean',
                    };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                  var valid5 = _errs23 === errors;
                } else {
                  var valid5 = true;
                }
                if (valid5) {
                  if (data.type !== void 0) {
                    let data8 = data.type;
                    const _errs25 = errors;
                    if (typeof data8 !== 'string') {
                      const err17 = {
                        instancePath: instancePath + '/type',
                        schemaPath: '#/oneOf/3/properties/type/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err17];
                      } else {
                        vErrors.push(err17);
                      }
                      errors++;
                    }
                    if (!(data8 === 'workspaceWrite')) {
                      const err18 = {
                        instancePath: instancePath + '/type',
                        schemaPath: '#/oneOf/3/properties/type/enum',
                        keyword: 'enum',
                        params: { allowedValues: schema26.oneOf[3].properties.type.enum },
                        message: 'must be equal to one of the allowed values',
                      };
                      if (vErrors === null) {
                        vErrors = [err18];
                      } else {
                        vErrors.push(err18);
                      }
                      errors++;
                    }
                    var valid5 = _errs25 === errors;
                  } else {
                    var valid5 = true;
                  }
                  if (valid5) {
                    if (data.writableRoots !== void 0) {
                      let data9 = data.writableRoots;
                      const _errs27 = errors;
                      if (errors === _errs27) {
                        if (Array.isArray(data9)) {
                          var valid6 = true;
                          const len0 = data9.length;
                          for (let i0 = 0; i0 < len0; i0++) {
                            const _errs29 = errors;
                            if (
                              !validate31(data9[i0], {
                                instancePath: instancePath + '/writableRoots/' + i0,
                                parentData: data9,
                                parentDataProperty: i0,
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate31.errors
                                  : vErrors.concat(validate31.errors);
                              errors = vErrors.length;
                            }
                            var valid6 = _errs29 === errors;
                            if (!valid6) {
                              break;
                            }
                          }
                        } else {
                          const err19 = {
                            instancePath: instancePath + '/writableRoots',
                            schemaPath: '#/oneOf/3/properties/writableRoots/type',
                            keyword: 'type',
                            params: { type: 'array' },
                            message: 'must be array',
                          };
                          if (vErrors === null) {
                            vErrors = [err19];
                          } else {
                            vErrors.push(err19);
                          }
                          errors++;
                        }
                      }
                      var valid5 = _errs27 === errors;
                    } else {
                      var valid5 = true;
                    }
                  }
                }
              }
            }
          }
        } else {
          const err20 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      var _valid0 = _errs17 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err21 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
    validate58.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate58.errors = vErrors;
  return errors === 0;
}
var schema28 = {
  properties: {
    agentNickname: {
      description: 'Optional random unique nickname assigned to an AgentControl-spawned sub-agent.',
      type: ['string', 'null'],
    },
    agentRole: {
      description: 'Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.',
      type: ['string', 'null'],
    },
    cliVersion: { description: 'Version of the CLI that created the thread.', type: 'string' },
    createdAt: {
      description: 'Unix timestamp (in seconds) when the thread was created.',
      format: 'int64',
      type: 'integer',
    },
    cwd: {
      allOf: [{ $ref: '#/definitions/v2/AbsolutePathBuf' }],
      description: 'Working directory captured for the thread.',
    },
    ephemeral: {
      description: 'Whether the thread is ephemeral and should not be materialized on disk.',
      type: 'boolean',
    },
    forkedFromId: {
      description: 'Source thread id when this thread was created by forking another thread.',
      type: ['string', 'null'],
    },
    gitInfo: {
      anyOf: [{ $ref: '#/definitions/v2/GitInfo' }, { type: 'null' }],
      description: 'Optional Git metadata captured when the thread was created.',
    },
    historyMode: {
      allOf: [{ $ref: '#/definitions/v2/ThreadHistoryMode' }],
      default: 'legacy',
      description: 'Persisted thread history contract selected when this thread was created.',
    },
    id: {
      description: 'Identifier for this thread. Codex-generated thread IDs are UUIDv7.',
      type: 'string',
    },
    model: {
      description:
        'Current configured model when loaded, otherwise the latest persisted model. Null when unavailable. This is not per-turn execution telemetry.',
      type: ['string', 'null'],
    },
    modelProvider: {
      description: "Model provider used for this thread (for example, 'openai').",
      type: 'string',
    },
    name: { description: 'Optional user-facing thread title.', type: ['string', 'null'] },
    originator: {
      description:
        'Originator recorded when the thread was created, independent of its current client or executor. Null when the recorded originator is unavailable.',
      type: ['string', 'null'],
    },
    parentThreadId: {
      description:
        'The ID of the parent thread. This will only be set if this thread is a subagent.',
      type: ['string', 'null'],
    },
    path: { description: '[UNSTABLE] Path to the thread on disk.', type: ['string', 'null'] },
    preview: {
      description: 'Usually the first user message in the thread, if available.',
      type: 'string',
    },
    projectId: {
      description: 'Canonical project assignment owned by app-server, if any.',
      type: ['string', 'null'],
    },
    reasoningEffort: {
      anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }],
      description:
        'Current configured reasoning effort when loaded, otherwise the latest persisted effort. Null when unset or unavailable. This is not per-turn execution telemetry.',
    },
    recencyAt: {
      description: 'Unix timestamp (in seconds) used for thread recency ordering.',
      format: 'int64',
      type: ['integer', 'null'],
    },
    section: {
      anyOf: [{ $ref: '#/definitions/v2/ThreadSection' }, { type: 'null' }],
      default: null,
      description: 'The independently persisted section selected for this thread, if any.',
    },
    sectionEnteredAt: {
      default: null,
      description: 'Unix timestamp in seconds when the thread entered its current section.',
      format: 'int64',
      type: ['integer', 'null'],
    },
    sessionId: {
      description: 'Session id shared by threads that belong to the same session tree.',
      type: 'string',
    },
    source: {
      allOf: [{ $ref: '#/definitions/v2/SessionSource' }],
      description: 'Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.).',
    },
    status: {
      allOf: [{ $ref: '#/definitions/v2/ThreadStatus' }],
      description: 'Current runtime status for the thread.',
    },
    threadSource: {
      anyOf: [{ $ref: '#/definitions/v2/ThreadSource' }, { type: 'null' }],
      description: 'Optional analytics source classification for this thread.',
    },
    turns: {
      description:
        'Only populated on `thread/resume`, `thread/fork`, and `thread/read` (when `includeTurns` is true) responses. For all other responses and notifications returning a Thread, the turns field will be an empty list.',
      items: { $ref: '#/definitions/v2/Turn' },
      type: 'array',
    },
    updatedAt: {
      description: 'Unix timestamp (in seconds) when the thread was last updated.',
      format: 'int64',
      type: 'integer',
    },
  },
  required: [
    'cliVersion',
    'createdAt',
    'cwd',
    'ephemeral',
    'id',
    'modelProvider',
    'preview',
    'projectId',
    'sessionId',
    'source',
    'status',
    'turns',
    'updatedAt',
  ],
  type: 'object',
};
var schema29 = {
  properties: {
    branch: { type: ['string', 'null'] },
    originUrl: { type: ['string', 'null'] },
    sha: { type: ['string', 'null'] },
  },
  type: 'object',
};
function validate65(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.branch !== void 0) {
        let data0 = data.branch;
        const _errs1 = errors;
        if (typeof data0 !== 'string' && data0 !== null) {
          validate65.errors = [
            {
              instancePath: instancePath + '/branch',
              schemaPath: '#/properties/branch/type',
              keyword: 'type',
              params: { type: schema29.properties.branch.type },
              message: 'must be string,null',
            },
          ];
          return false;
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.originUrl !== void 0) {
          let data1 = data.originUrl;
          const _errs3 = errors;
          if (typeof data1 !== 'string' && data1 !== null) {
            validate65.errors = [
              {
                instancePath: instancePath + '/originUrl',
                schemaPath: '#/properties/originUrl/type',
                keyword: 'type',
                params: { type: schema29.properties.originUrl.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs3 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.sha !== void 0) {
            let data2 = data.sha;
            const _errs5 = errors;
            if (typeof data2 !== 'string' && data2 !== null) {
              validate65.errors = [
                {
                  instancePath: instancePath + '/sha',
                  schemaPath: '#/properties/sha/type',
                  keyword: 'type',
                  params: { type: schema29.properties.sha.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs5 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate65.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate65.errors = vErrors;
  return errors === 0;
}
var schema30 = { enum: ['legacy', 'paginated'], type: 'string' };
function validate67(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate67.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'legacy' || data === 'paginated')) {
    validate67.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema30.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate67.errors = vErrors;
  return errors === 0;
}
var schema32 = {
  description: 'Extensible visual presentation for a custom thread section.',
  properties: { color: { type: ['string', 'null'] }, icon: { type: ['string', 'null'] } },
  type: 'object',
};
function validate71(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.color !== void 0) {
        let data0 = data.color;
        const _errs1 = errors;
        if (typeof data0 !== 'string' && data0 !== null) {
          validate71.errors = [
            {
              instancePath: instancePath + '/color',
              schemaPath: '#/properties/color/type',
              keyword: 'type',
              params: { type: schema32.properties.color.type },
              message: 'must be string,null',
            },
          ];
          return false;
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.icon !== void 0) {
          let data1 = data.icon;
          const _errs3 = errors;
          if (typeof data1 !== 'string' && data1 !== null) {
            validate71.errors = [
              {
                instancePath: instancePath + '/icon',
                schemaPath: '#/properties/icon/type',
                keyword: 'type',
                params: { type: schema32.properties.icon.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs3 === errors;
        } else {
          var valid0 = true;
        }
      }
    } else {
      validate71.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate71.errors = vErrors;
  return errors === 0;
}
function validate70(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.id === void 0 && (missing0 = 'id')) ||
        (data.name === void 0 && (missing0 = 'name'))
      ) {
        validate70.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.appearance !== void 0) {
          let data0 = data.appearance;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          if (
            !validate71(data0, {
              instancePath: instancePath + '/appearance',
              parentData: data,
              parentDataProperty: 'appearance',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs4 = errors;
            if (data0 !== null) {
              const err0 = {
                instancePath: instancePath + '/appearance',
                schemaPath: '#/properties/appearance/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
            var _valid0 = _errs4 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err1 = {
              instancePath: instancePath + '/appearance',
              schemaPath: '#/properties/appearance/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate70.errors = vErrors;
            return false;
          } else {
            errors = _errs2;
            if (vErrors !== null) {
              if (_errs2) {
                vErrors.length = _errs2;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.id !== void 0) {
            const _errs6 = errors;
            if (typeof data.id !== 'string') {
              validate70.errors = [
                {
                  instancePath: instancePath + '/id',
                  schemaPath: '#/properties/id/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs6 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.name !== void 0) {
              const _errs8 = errors;
              if (typeof data.name !== 'string') {
                validate70.errors = [
                  {
                    instancePath: instancePath + '/name',
                    schemaPath: '#/properties/name/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate70.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate70.errors = vErrors;
  return errors === 0;
}
var schema33 = {
  oneOf: [
    { enum: ['cli', 'vscode', 'exec', 'appServer', 'unknown'], type: 'string' },
    {
      additionalProperties: false,
      properties: { custom: { type: 'string' } },
      required: ['custom'],
      title: 'CustomSessionSource',
      type: 'object',
    },
    {
      additionalProperties: false,
      properties: { subAgent: { $ref: '#/definitions/v2/SubAgentSource' } },
      required: ['subAgent'],
      title: 'SubAgentSessionSource',
      type: 'object',
    },
  ],
};
var schema34 = {
  oneOf: [
    { enum: ['review', 'compact', 'memory_consolidation'], type: 'string' },
    {
      additionalProperties: false,
      properties: {
        thread_spawn: {
          properties: {
            agent_nickname: { default: null, type: ['string', 'null'] },
            agent_path: {
              anyOf: [{ $ref: '#/definitions/v2/AgentPath' }, { type: 'null' }],
              default: null,
            },
            agent_role: { default: null, type: ['string', 'null'] },
            depth: { format: 'int32', type: 'integer' },
            parent_thread_id: { $ref: '#/definitions/v2/ThreadId' },
          },
          required: ['depth', 'parent_thread_id'],
          type: 'object',
        },
      },
      required: ['thread_spawn'],
      title: 'ThreadSpawnSubAgentSource',
      type: 'object',
    },
    {
      additionalProperties: false,
      properties: { other: { type: 'string' } },
      required: ['other'],
      title: 'OtherSubAgentSource',
      type: 'object',
    },
  ],
};
function validate76(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate76.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  validate76.errors = vErrors;
  return errors === 0;
}
function validate78(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate78.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  validate78.errors = vErrors;
  return errors === 0;
}
function validate75(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === 'review' || data === 'compact' || data === 'memory_consolidation')) {
    const err1 = {
      instancePath,
      schemaPath: '#/oneOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema34.oneOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (errors === _errs3) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.thread_spawn === void 0 && (missing0 = 'thread_spawn')) {
        const err2 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      } else {
        const _errs5 = errors;
        for (const key0 in data) {
          if (!(key0 === 'thread_spawn')) {
            const err3 = {
              instancePath,
              schemaPath: '#/oneOf/1/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key0 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            break;
          }
        }
        if (_errs5 === errors) {
          if (data.thread_spawn !== void 0) {
            let data0 = data.thread_spawn;
            const _errs6 = errors;
            if (errors === _errs6) {
              if (data0 && typeof data0 == 'object' && !Array.isArray(data0)) {
                let missing1;
                if (
                  (data0.depth === void 0 && (missing1 = 'depth')) ||
                  (data0.parent_thread_id === void 0 && (missing1 = 'parent_thread_id'))
                ) {
                  const err4 = {
                    instancePath: instancePath + '/thread_spawn',
                    schemaPath: '#/oneOf/1/properties/thread_spawn/required',
                    keyword: 'required',
                    params: { missingProperty: missing1 },
                    message: "must have required property '" + missing1 + "'",
                  };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                } else {
                  if (data0.agent_nickname !== void 0) {
                    let data1 = data0.agent_nickname;
                    const _errs8 = errors;
                    if (typeof data1 !== 'string' && data1 !== null) {
                      const err5 = {
                        instancePath: instancePath + '/thread_spawn/agent_nickname',
                        schemaPath:
                          '#/oneOf/1/properties/thread_spawn/properties/agent_nickname/type',
                        keyword: 'type',
                        params: {
                          type: schema34.oneOf[1].properties.thread_spawn.properties.agent_nickname
                            .type,
                        },
                        message: 'must be string,null',
                      };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    }
                    var valid2 = _errs8 === errors;
                  } else {
                    var valid2 = true;
                  }
                  if (valid2) {
                    if (data0.agent_path !== void 0) {
                      let data2 = data0.agent_path;
                      const _errs10 = errors;
                      const _errs11 = errors;
                      let valid3 = false;
                      const _errs12 = errors;
                      if (
                        !validate76(data2, {
                          instancePath: instancePath + '/thread_spawn/agent_path',
                          parentData: data0,
                          parentDataProperty: 'agent_path',
                          rootData,
                        })
                      ) {
                        vErrors =
                          vErrors === null ? validate76.errors : vErrors.concat(validate76.errors);
                        errors = vErrors.length;
                      }
                      var _valid1 = _errs12 === errors;
                      valid3 = valid3 || _valid1;
                      if (!valid3) {
                        const _errs13 = errors;
                        if (data2 !== null) {
                          const err6 = {
                            instancePath: instancePath + '/thread_spawn/agent_path',
                            schemaPath:
                              '#/oneOf/1/properties/thread_spawn/properties/agent_path/anyOf/1/type',
                            keyword: 'type',
                            params: { type: 'null' },
                            message: 'must be null',
                          };
                          if (vErrors === null) {
                            vErrors = [err6];
                          } else {
                            vErrors.push(err6);
                          }
                          errors++;
                        }
                        var _valid1 = _errs13 === errors;
                        valid3 = valid3 || _valid1;
                      }
                      if (!valid3) {
                        const err7 = {
                          instancePath: instancePath + '/thread_spawn/agent_path',
                          schemaPath:
                            '#/oneOf/1/properties/thread_spawn/properties/agent_path/anyOf',
                          keyword: 'anyOf',
                          params: {},
                          message: 'must match a schema in anyOf',
                        };
                        if (vErrors === null) {
                          vErrors = [err7];
                        } else {
                          vErrors.push(err7);
                        }
                        errors++;
                      } else {
                        errors = _errs11;
                        if (vErrors !== null) {
                          if (_errs11) {
                            vErrors.length = _errs11;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                      var valid2 = _errs10 === errors;
                    } else {
                      var valid2 = true;
                    }
                    if (valid2) {
                      if (data0.agent_role !== void 0) {
                        let data3 = data0.agent_role;
                        const _errs15 = errors;
                        if (typeof data3 !== 'string' && data3 !== null) {
                          const err8 = {
                            instancePath: instancePath + '/thread_spawn/agent_role',
                            schemaPath:
                              '#/oneOf/1/properties/thread_spawn/properties/agent_role/type',
                            keyword: 'type',
                            params: {
                              type: schema34.oneOf[1].properties.thread_spawn.properties.agent_role
                                .type,
                            },
                            message: 'must be string,null',
                          };
                          if (vErrors === null) {
                            vErrors = [err8];
                          } else {
                            vErrors.push(err8);
                          }
                          errors++;
                        }
                        var valid2 = _errs15 === errors;
                      } else {
                        var valid2 = true;
                      }
                      if (valid2) {
                        if (data0.depth !== void 0) {
                          let data4 = data0.depth;
                          const _errs17 = errors;
                          if (!(typeof data4 == 'number' && !(data4 % 1) && !isNaN(data4))) {
                            const err9 = {
                              instancePath: instancePath + '/thread_spawn/depth',
                              schemaPath: '#/oneOf/1/properties/thread_spawn/properties/depth/type',
                              keyword: 'type',
                              params: { type: 'integer' },
                              message: 'must be integer',
                            };
                            if (vErrors === null) {
                              vErrors = [err9];
                            } else {
                              vErrors.push(err9);
                            }
                            errors++;
                          }
                          var valid2 = _errs17 === errors;
                        } else {
                          var valid2 = true;
                        }
                        if (valid2) {
                          if (data0.parent_thread_id !== void 0) {
                            const _errs19 = errors;
                            if (
                              !validate78(data0.parent_thread_id, {
                                instancePath: instancePath + '/thread_spawn/parent_thread_id',
                                parentData: data0,
                                parentDataProperty: 'parent_thread_id',
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate78.errors
                                  : vErrors.concat(validate78.errors);
                              errors = vErrors.length;
                            }
                            var valid2 = _errs19 === errors;
                          } else {
                            var valid2 = true;
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                const err10 = {
                  instancePath: instancePath + '/thread_spawn',
                  schemaPath: '#/oneOf/1/properties/thread_spawn/type',
                  keyword: 'type',
                  params: { type: 'object' },
                  message: 'must be object',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
          }
        }
      }
    } else {
      const err11 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs20 = errors;
    if (errors === _errs20) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.other === void 0 && (missing2 = 'other')) {
          const err12 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        } else {
          const _errs22 = errors;
          for (const key1 in data) {
            if (!(key1 === 'other')) {
              const err13 = {
                instancePath,
                schemaPath: '#/oneOf/2/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
              break;
            }
          }
          if (_errs22 === errors) {
            if (data.other !== void 0) {
              if (typeof data.other !== 'string') {
                const err14 = {
                  instancePath: instancePath + '/other',
                  schemaPath: '#/oneOf/2/properties/other/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
          }
        }
      } else {
        const err15 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    var _valid0 = _errs20 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err16 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
    validate75.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate75.errors = vErrors;
  return errors === 0;
}
function validate74(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(
    data === 'cli' ||
    data === 'vscode' ||
    data === 'exec' ||
    data === 'appServer' ||
    data === 'unknown'
  )) {
    const err1 = {
      instancePath,
      schemaPath: '#/oneOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema33.oneOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (errors === _errs3) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.custom === void 0 && (missing0 = 'custom')) {
        const err2 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      } else {
        const _errs5 = errors;
        for (const key0 in data) {
          if (!(key0 === 'custom')) {
            const err3 = {
              instancePath,
              schemaPath: '#/oneOf/1/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key0 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            break;
          }
        }
        if (_errs5 === errors) {
          if (data.custom !== void 0) {
            if (typeof data.custom !== 'string') {
              const err4 = {
                instancePath: instancePath + '/custom',
                schemaPath: '#/oneOf/1/properties/custom/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          }
        }
      }
    } else {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs8 = errors;
    if (errors === _errs8) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing1;
        if (data.subAgent === void 0 && (missing1 = 'subAgent')) {
          const err6 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing1 },
            message: "must have required property '" + missing1 + "'",
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        } else {
          const _errs10 = errors;
          for (const key1 in data) {
            if (!(key1 === 'subAgent')) {
              const err7 = {
                instancePath,
                schemaPath: '#/oneOf/2/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
              break;
            }
          }
          if (_errs10 === errors) {
            if (data.subAgent !== void 0) {
              if (
                !validate75(data.subAgent, {
                  instancePath: instancePath + '/subAgent',
                  parentData: data,
                  parentDataProperty: 'subAgent',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate75.errors : vErrors.concat(validate75.errors);
                errors = vErrors.length;
              }
            }
          }
        }
      } else {
        const err8 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    var _valid0 = _errs8 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err9 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
    validate74.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate74.errors = vErrors;
  return errors === 0;
}
var schema37 = {
  oneOf: [
    {
      properties: {
        type: { enum: ['notLoaded'], title: 'NotLoadedThreadStatusType', type: 'string' },
      },
      required: ['type'],
      title: 'NotLoadedThreadStatus',
      type: 'object',
    },
    {
      properties: { type: { enum: ['idle'], title: 'IdleThreadStatusType', type: 'string' } },
      required: ['type'],
      title: 'IdleThreadStatus',
      type: 'object',
    },
    {
      properties: {
        type: { enum: ['systemError'], title: 'SystemErrorThreadStatusType', type: 'string' },
      },
      required: ['type'],
      title: 'SystemErrorThreadStatus',
      type: 'object',
    },
    {
      properties: {
        activeFlags: { items: { $ref: '#/definitions/v2/ThreadActiveFlag' }, type: 'array' },
        type: { enum: ['active'], title: 'ActiveThreadStatusType', type: 'string' },
      },
      required: ['activeFlags', 'type'],
      title: 'ActiveThreadStatus',
      type: 'object',
    },
  ],
};
var schema38 = { enum: ['waitingOnApproval', 'waitingOnUserInput'], type: 'string' };
function validate83(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate83.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'waitingOnApproval' || data === 'waitingOnUserInput')) {
    validate83.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema38.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate83.errors = vErrors;
  return errors === 0;
}
function validate82(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = 'type')) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== 'string') {
            const err1 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/0/properties/type/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          if (!(data0 === 'notLoaded')) {
            const err2 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/0/properties/type/enum',
              keyword: 'enum',
              params: { allowedValues: schema37.oneOf[0].properties.type.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
      }
    } else {
      const err3 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (errors === _errs5) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = 'type')) {
        const err4 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data1 = data.type;
          if (typeof data1 !== 'string') {
            const err5 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/1/properties/type/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data1 === 'idle')) {
            const err6 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/1/properties/type/enum',
              keyword: 'enum',
              params: { allowedValues: schema37.oneOf[1].properties.type.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      }
    } else {
      const err7 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs9 = errors;
    if (errors === _errs9) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.type === void 0 && (missing2 = 'type')) {
          const err8 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          if (data.type !== void 0) {
            let data2 = data.type;
            if (typeof data2 !== 'string') {
              const err9 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/2/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (!(data2 === 'systemError')) {
              const err10 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/2/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema37.oneOf[2].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
      } else {
        const err11 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    var _valid0 = _errs9 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs13 = errors;
      if (errors === _errs13) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing3;
          if (
            (data.activeFlags === void 0 && (missing3 = 'activeFlags')) ||
            (data.type === void 0 && (missing3 = 'type'))
          ) {
            const err12 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing3 },
              message: "must have required property '" + missing3 + "'",
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          } else {
            if (data.activeFlags !== void 0) {
              let data3 = data.activeFlags;
              const _errs15 = errors;
              if (errors === _errs15) {
                if (Array.isArray(data3)) {
                  var valid5 = true;
                  const len0 = data3.length;
                  for (let i0 = 0; i0 < len0; i0++) {
                    const _errs17 = errors;
                    if (
                      !validate83(data3[i0], {
                        instancePath: instancePath + '/activeFlags/' + i0,
                        parentData: data3,
                        parentDataProperty: i0,
                        rootData,
                      })
                    ) {
                      vErrors =
                        vErrors === null ? validate83.errors : vErrors.concat(validate83.errors);
                      errors = vErrors.length;
                    }
                    var valid5 = _errs17 === errors;
                    if (!valid5) {
                      break;
                    }
                  }
                } else {
                  const err13 = {
                    instancePath: instancePath + '/activeFlags',
                    schemaPath: '#/oneOf/3/properties/activeFlags/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                  };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
              var valid4 = _errs15 === errors;
            } else {
              var valid4 = true;
            }
            if (valid4) {
              if (data.type !== void 0) {
                let data5 = data.type;
                const _errs18 = errors;
                if (typeof data5 !== 'string') {
                  const err14 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/3/properties/type/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (!(data5 === 'active')) {
                  const err15 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/3/properties/type/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema37.oneOf[3].properties.type.enum },
                    message: 'must be equal to one of the allowed values',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                var valid4 = _errs18 === errors;
              } else {
                var valid4 = true;
              }
            }
          }
        } else {
          const err16 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      var _valid0 = _errs13 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err17 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
    validate82.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate82.errors = vErrors;
  return errors === 0;
}
var schema39 = {
  properties: {
    completedAt: {
      description: 'Unix timestamp (in seconds) when the turn completed.',
      format: 'int64',
      type: ['integer', 'null'],
    },
    durationMs: {
      description: 'Duration between turn start and completion in milliseconds, if known.',
      format: 'int64',
      type: ['integer', 'null'],
    },
    error: {
      anyOf: [{ $ref: '#/definitions/v2/TurnError' }, { type: 'null' }],
      description: 'Error associated with a failed or interrupted turn.',
    },
    id: {
      description: 'Identifier for this turn. Codex-generated turn IDs are UUIDv7.',
      type: 'string',
    },
    items: {
      description: 'Thread items currently included in this turn payload.',
      items: { $ref: '#/definitions/v2/ThreadItem' },
      type: 'array',
    },
    itemsView: {
      allOf: [{ $ref: '#/definitions/v2/TurnItemsView' }],
      default: 'full',
      description: 'Describes how much of `items` has been loaded for this turn.',
    },
    rootTurnId: {
      description:
        'ID of the first turn in the chain of work that led to this turn. Pass this as `rootTurnId` when starting work on behalf of this turn. May be null in older history or a `review/start` response.',
      type: ['string', 'null'],
    },
    startedAt: {
      description: 'Unix timestamp (in seconds) when the turn started.',
      format: 'int64',
      type: ['integer', 'null'],
    },
    status: { $ref: '#/definitions/v2/TurnStatus' },
  },
  required: ['id', 'items', 'status'],
  type: 'object',
};
var schema40 = {
  properties: {
    additionalDetails: { default: null, type: ['string', 'null'] },
    codexErrorInfo: { anyOf: [{ $ref: '#/definitions/v2/CodexErrorInfo' }, { type: 'null' }] },
    message: { type: 'string' },
    misalignment: {
      anyOf: [{ $ref: '#/definitions/v2/MisalignmentErrorDetails' }, { type: 'null' }],
      default: null,
      description:
        'Optional public explanation and continuation instruction for a misalignment block.',
    },
  },
  required: ['message'],
  type: 'object',
};
var schema41 = {
  anyOf: [
    {
      enum: [
        'contextWindowExceeded',
        'sessionBudgetExceeded',
        'usageLimitExceeded',
        'rateLimitExceeded',
        'flexUnavailable',
        'serverOverloaded',
        'cyberPolicy',
        'misalignmentPolicyViolation',
        'tooManyDenials',
        'internalServerError',
        'unauthorized',
        'badRequest',
        'threadRollbackFailed',
        'sandboxError',
        'other',
      ],
      type: 'string',
    },
    {
      additionalProperties: false,
      properties: {
        httpConnectionFailed: {
          properties: {
            httpStatusCode: { format: 'uint16', minimum: 0, type: ['integer', 'null'] },
          },
          type: 'object',
        },
      },
      required: ['httpConnectionFailed'],
      title: 'HttpConnectionFailedCodexErrorInfo',
      type: 'object',
    },
    {
      additionalProperties: false,
      description: 'Failed to connect to the response SSE stream.',
      properties: {
        responseStreamConnectionFailed: {
          properties: {
            httpStatusCode: { format: 'uint16', minimum: 0, type: ['integer', 'null'] },
          },
          type: 'object',
        },
      },
      required: ['responseStreamConnectionFailed'],
      title: 'ResponseStreamConnectionFailedCodexErrorInfo',
      type: 'object',
    },
    {
      additionalProperties: false,
      description:
        'The response SSE stream disconnected in the middle of a turn before completion.',
      properties: {
        responseStreamDisconnected: {
          properties: {
            httpStatusCode: { format: 'uint16', minimum: 0, type: ['integer', 'null'] },
          },
          type: 'object',
        },
      },
      required: ['responseStreamDisconnected'],
      title: 'ResponseStreamDisconnectedCodexErrorInfo',
      type: 'object',
    },
    {
      additionalProperties: false,
      description: 'Reached the retry limit for responses.',
      properties: {
        responseTooManyFailedAttempts: {
          properties: {
            httpStatusCode: { format: 'uint16', minimum: 0, type: ['integer', 'null'] },
          },
          type: 'object',
        },
      },
      required: ['responseTooManyFailedAttempts'],
      title: 'ResponseTooManyFailedAttemptsCodexErrorInfo',
      type: 'object',
    },
    {
      additionalProperties: false,
      description:
        'Returned when `turn/start` or `turn/steer` is submitted while the current active turn cannot accept same-turn steering, for example `/review` or manual `/compact`.',
      properties: {
        activeTurnNotSteerable: {
          properties: { turnKind: { $ref: '#/definitions/v2/NonSteerableTurnKind' } },
          required: ['turnKind'],
          type: 'object',
        },
      },
      required: ['activeTurnNotSteerable'],
      title: 'ActiveTurnNotSteerableCodexErrorInfo',
      type: 'object',
    },
    { type: ['string', 'object'] },
  ],
  description:
    'This translation layer make sure that we expose codex error code in camel case.\n\nWhen an upstream HTTP status is available (for example, from the Responses API or a provider), it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.',
};
var schema42 = { enum: ['review', 'compact'], type: 'string' };
function validate90(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate90.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'review' || data === 'compact')) {
    validate90.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema42.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate90.errors = vErrors;
  return errors === 0;
}
function validate89(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/anyOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(
    data === 'contextWindowExceeded' ||
    data === 'sessionBudgetExceeded' ||
    data === 'usageLimitExceeded' ||
    data === 'rateLimitExceeded' ||
    data === 'flexUnavailable' ||
    data === 'serverOverloaded' ||
    data === 'cyberPolicy' ||
    data === 'misalignmentPolicyViolation' ||
    data === 'tooManyDenials' ||
    data === 'internalServerError' ||
    data === 'unauthorized' ||
    data === 'badRequest' ||
    data === 'threadRollbackFailed' ||
    data === 'sandboxError' ||
    data === 'other'
  )) {
    const err1 = {
      instancePath,
      schemaPath: '#/anyOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema41.anyOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs3 = errors;
    if (errors === _errs3) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing0;
        if (data.httpConnectionFailed === void 0 && (missing0 = 'httpConnectionFailed')) {
          const err2 = {
            instancePath,
            schemaPath: '#/anyOf/1/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        } else {
          const _errs5 = errors;
          for (const key0 in data) {
            if (!(key0 === 'httpConnectionFailed')) {
              const err3 = {
                instancePath,
                schemaPath: '#/anyOf/1/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key0 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
              break;
            }
          }
          if (_errs5 === errors) {
            if (data.httpConnectionFailed !== void 0) {
              let data0 = data.httpConnectionFailed;
              const _errs6 = errors;
              if (errors === _errs6) {
                if (data0 && typeof data0 == 'object' && !Array.isArray(data0)) {
                  if (data0.httpStatusCode !== void 0) {
                    let data1 = data0.httpStatusCode;
                    const _errs8 = errors;
                    if (
                      !(typeof data1 == 'number' && !(data1 % 1) && !isNaN(data1)) &&
                      data1 !== null
                    ) {
                      const err4 = {
                        instancePath: instancePath + '/httpConnectionFailed/httpStatusCode',
                        schemaPath:
                          '#/anyOf/1/properties/httpConnectionFailed/properties/httpStatusCode/type',
                        keyword: 'type',
                        params: {
                          type: schema41.anyOf[1].properties.httpConnectionFailed.properties
                            .httpStatusCode.type,
                        },
                        message: 'must be integer,null',
                      };
                      if (vErrors === null) {
                        vErrors = [err4];
                      } else {
                        vErrors.push(err4);
                      }
                      errors++;
                    }
                    if (errors === _errs8) {
                      if (typeof data1 == 'number') {
                        if (data1 < 0 || isNaN(data1)) {
                          const err5 = {
                            instancePath: instancePath + '/httpConnectionFailed/httpStatusCode',
                            schemaPath:
                              '#/anyOf/1/properties/httpConnectionFailed/properties/httpStatusCode/minimum',
                            keyword: 'minimum',
                            params: { comparison: '>=', limit: 0 },
                            message: 'must be >= 0',
                          };
                          if (vErrors === null) {
                            vErrors = [err5];
                          } else {
                            vErrors.push(err5);
                          }
                          errors++;
                        }
                      }
                    }
                  }
                } else {
                  const err6 = {
                    instancePath: instancePath + '/httpConnectionFailed',
                    schemaPath: '#/anyOf/1/properties/httpConnectionFailed/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                  };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
              }
            }
          }
        }
      } else {
        const err7 = {
          instancePath,
          schemaPath: '#/anyOf/1/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const _errs10 = errors;
      if (errors === _errs10) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing1;
          if (
            data.responseStreamConnectionFailed === void 0 &&
            (missing1 = 'responseStreamConnectionFailed')
          ) {
            const err8 = {
              instancePath,
              schemaPath: '#/anyOf/2/required',
              keyword: 'required',
              params: { missingProperty: missing1 },
              message: "must have required property '" + missing1 + "'",
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          } else {
            const _errs12 = errors;
            for (const key1 in data) {
              if (!(key1 === 'responseStreamConnectionFailed')) {
                const err9 = {
                  instancePath,
                  schemaPath: '#/anyOf/2/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key1 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
                break;
              }
            }
            if (_errs12 === errors) {
              if (data.responseStreamConnectionFailed !== void 0) {
                let data2 = data.responseStreamConnectionFailed;
                const _errs13 = errors;
                if (errors === _errs13) {
                  if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
                    if (data2.httpStatusCode !== void 0) {
                      let data3 = data2.httpStatusCode;
                      const _errs15 = errors;
                      if (
                        !(typeof data3 == 'number' && !(data3 % 1) && !isNaN(data3)) &&
                        data3 !== null
                      ) {
                        const err10 = {
                          instancePath:
                            instancePath + '/responseStreamConnectionFailed/httpStatusCode',
                          schemaPath:
                            '#/anyOf/2/properties/responseStreamConnectionFailed/properties/httpStatusCode/type',
                          keyword: 'type',
                          params: {
                            type: schema41.anyOf[2].properties.responseStreamConnectionFailed
                              .properties.httpStatusCode.type,
                          },
                          message: 'must be integer,null',
                        };
                        if (vErrors === null) {
                          vErrors = [err10];
                        } else {
                          vErrors.push(err10);
                        }
                        errors++;
                      }
                      if (errors === _errs15) {
                        if (typeof data3 == 'number') {
                          if (data3 < 0 || isNaN(data3)) {
                            const err11 = {
                              instancePath:
                                instancePath + '/responseStreamConnectionFailed/httpStatusCode',
                              schemaPath:
                                '#/anyOf/2/properties/responseStreamConnectionFailed/properties/httpStatusCode/minimum',
                              keyword: 'minimum',
                              params: { comparison: '>=', limit: 0 },
                              message: 'must be >= 0',
                            };
                            if (vErrors === null) {
                              vErrors = [err11];
                            } else {
                              vErrors.push(err11);
                            }
                            errors++;
                          }
                        }
                      }
                    }
                  } else {
                    const err12 = {
                      instancePath: instancePath + '/responseStreamConnectionFailed',
                      schemaPath: '#/anyOf/2/properties/responseStreamConnectionFailed/type',
                      keyword: 'type',
                      params: { type: 'object' },
                      message: 'must be object',
                    };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
              }
            }
          }
        } else {
          const err13 = {
            instancePath,
            schemaPath: '#/anyOf/2/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
      var _valid0 = _errs10 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs17 = errors;
        if (errors === _errs17) {
          if (data && typeof data == 'object' && !Array.isArray(data)) {
            let missing2;
            if (
              data.responseStreamDisconnected === void 0 &&
              (missing2 = 'responseStreamDisconnected')
            ) {
              const err14 = {
                instancePath,
                schemaPath: '#/anyOf/3/required',
                keyword: 'required',
                params: { missingProperty: missing2 },
                message: "must have required property '" + missing2 + "'",
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            } else {
              const _errs19 = errors;
              for (const key2 in data) {
                if (!(key2 === 'responseStreamDisconnected')) {
                  const err15 = {
                    instancePath,
                    schemaPath: '#/anyOf/3/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key2 },
                    message: 'must NOT have additional properties',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                  break;
                }
              }
              if (_errs19 === errors) {
                if (data.responseStreamDisconnected !== void 0) {
                  let data4 = data.responseStreamDisconnected;
                  const _errs20 = errors;
                  if (errors === _errs20) {
                    if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
                      if (data4.httpStatusCode !== void 0) {
                        let data5 = data4.httpStatusCode;
                        const _errs22 = errors;
                        if (
                          !(typeof data5 == 'number' && !(data5 % 1) && !isNaN(data5)) &&
                          data5 !== null
                        ) {
                          const err16 = {
                            instancePath:
                              instancePath + '/responseStreamDisconnected/httpStatusCode',
                            schemaPath:
                              '#/anyOf/3/properties/responseStreamDisconnected/properties/httpStatusCode/type',
                            keyword: 'type',
                            params: {
                              type: schema41.anyOf[3].properties.responseStreamDisconnected
                                .properties.httpStatusCode.type,
                            },
                            message: 'must be integer,null',
                          };
                          if (vErrors === null) {
                            vErrors = [err16];
                          } else {
                            vErrors.push(err16);
                          }
                          errors++;
                        }
                        if (errors === _errs22) {
                          if (typeof data5 == 'number') {
                            if (data5 < 0 || isNaN(data5)) {
                              const err17 = {
                                instancePath:
                                  instancePath + '/responseStreamDisconnected/httpStatusCode',
                                schemaPath:
                                  '#/anyOf/3/properties/responseStreamDisconnected/properties/httpStatusCode/minimum',
                                keyword: 'minimum',
                                params: { comparison: '>=', limit: 0 },
                                message: 'must be >= 0',
                              };
                              if (vErrors === null) {
                                vErrors = [err17];
                              } else {
                                vErrors.push(err17);
                              }
                              errors++;
                            }
                          }
                        }
                      }
                    } else {
                      const err18 = {
                        instancePath: instancePath + '/responseStreamDisconnected',
                        schemaPath: '#/anyOf/3/properties/responseStreamDisconnected/type',
                        keyword: 'type',
                        params: { type: 'object' },
                        message: 'must be object',
                      };
                      if (vErrors === null) {
                        vErrors = [err18];
                      } else {
                        vErrors.push(err18);
                      }
                      errors++;
                    }
                  }
                }
              }
            }
          } else {
            const err19 = {
              instancePath,
              schemaPath: '#/anyOf/3/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        var _valid0 = _errs17 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs24 = errors;
          if (errors === _errs24) {
            if (data && typeof data == 'object' && !Array.isArray(data)) {
              let missing3;
              if (
                data.responseTooManyFailedAttempts === void 0 &&
                (missing3 = 'responseTooManyFailedAttempts')
              ) {
                const err20 = {
                  instancePath,
                  schemaPath: '#/anyOf/4/required',
                  keyword: 'required',
                  params: { missingProperty: missing3 },
                  message: "must have required property '" + missing3 + "'",
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              } else {
                const _errs26 = errors;
                for (const key3 in data) {
                  if (!(key3 === 'responseTooManyFailedAttempts')) {
                    const err21 = {
                      instancePath,
                      schemaPath: '#/anyOf/4/additionalProperties',
                      keyword: 'additionalProperties',
                      params: { additionalProperty: key3 },
                      message: 'must NOT have additional properties',
                    };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                    break;
                  }
                }
                if (_errs26 === errors) {
                  if (data.responseTooManyFailedAttempts !== void 0) {
                    let data6 = data.responseTooManyFailedAttempts;
                    const _errs27 = errors;
                    if (errors === _errs27) {
                      if (data6 && typeof data6 == 'object' && !Array.isArray(data6)) {
                        if (data6.httpStatusCode !== void 0) {
                          let data7 = data6.httpStatusCode;
                          const _errs29 = errors;
                          if (
                            !(typeof data7 == 'number' && !(data7 % 1) && !isNaN(data7)) &&
                            data7 !== null
                          ) {
                            const err22 = {
                              instancePath:
                                instancePath + '/responseTooManyFailedAttempts/httpStatusCode',
                              schemaPath:
                                '#/anyOf/4/properties/responseTooManyFailedAttempts/properties/httpStatusCode/type',
                              keyword: 'type',
                              params: {
                                type: schema41.anyOf[4].properties.responseTooManyFailedAttempts
                                  .properties.httpStatusCode.type,
                              },
                              message: 'must be integer,null',
                            };
                            if (vErrors === null) {
                              vErrors = [err22];
                            } else {
                              vErrors.push(err22);
                            }
                            errors++;
                          }
                          if (errors === _errs29) {
                            if (typeof data7 == 'number') {
                              if (data7 < 0 || isNaN(data7)) {
                                const err23 = {
                                  instancePath:
                                    instancePath + '/responseTooManyFailedAttempts/httpStatusCode',
                                  schemaPath:
                                    '#/anyOf/4/properties/responseTooManyFailedAttempts/properties/httpStatusCode/minimum',
                                  keyword: 'minimum',
                                  params: { comparison: '>=', limit: 0 },
                                  message: 'must be >= 0',
                                };
                                if (vErrors === null) {
                                  vErrors = [err23];
                                } else {
                                  vErrors.push(err23);
                                }
                                errors++;
                              }
                            }
                          }
                        }
                      } else {
                        const err24 = {
                          instancePath: instancePath + '/responseTooManyFailedAttempts',
                          schemaPath: '#/anyOf/4/properties/responseTooManyFailedAttempts/type',
                          keyword: 'type',
                          params: { type: 'object' },
                          message: 'must be object',
                        };
                        if (vErrors === null) {
                          vErrors = [err24];
                        } else {
                          vErrors.push(err24);
                        }
                        errors++;
                      }
                    }
                  }
                }
              }
            } else {
              const err25 = {
                instancePath,
                schemaPath: '#/anyOf/4/type',
                keyword: 'type',
                params: { type: 'object' },
                message: 'must be object',
              };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          }
          var _valid0 = _errs24 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs31 = errors;
            if (errors === _errs31) {
              if (data && typeof data == 'object' && !Array.isArray(data)) {
                let missing4;
                if (
                  data.activeTurnNotSteerable === void 0 &&
                  (missing4 = 'activeTurnNotSteerable')
                ) {
                  const err26 = {
                    instancePath,
                    schemaPath: '#/anyOf/5/required',
                    keyword: 'required',
                    params: { missingProperty: missing4 },
                    message: "must have required property '" + missing4 + "'",
                  };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                } else {
                  const _errs33 = errors;
                  for (const key4 in data) {
                    if (!(key4 === 'activeTurnNotSteerable')) {
                      const err27 = {
                        instancePath,
                        schemaPath: '#/anyOf/5/additionalProperties',
                        keyword: 'additionalProperties',
                        params: { additionalProperty: key4 },
                        message: 'must NOT have additional properties',
                      };
                      if (vErrors === null) {
                        vErrors = [err27];
                      } else {
                        vErrors.push(err27);
                      }
                      errors++;
                      break;
                    }
                  }
                  if (_errs33 === errors) {
                    if (data.activeTurnNotSteerable !== void 0) {
                      let data8 = data.activeTurnNotSteerable;
                      const _errs34 = errors;
                      if (errors === _errs34) {
                        if (data8 && typeof data8 == 'object' && !Array.isArray(data8)) {
                          let missing5;
                          if (data8.turnKind === void 0 && (missing5 = 'turnKind')) {
                            const err28 = {
                              instancePath: instancePath + '/activeTurnNotSteerable',
                              schemaPath: '#/anyOf/5/properties/activeTurnNotSteerable/required',
                              keyword: 'required',
                              params: { missingProperty: missing5 },
                              message: "must have required property '" + missing5 + "'",
                            };
                            if (vErrors === null) {
                              vErrors = [err28];
                            } else {
                              vErrors.push(err28);
                            }
                            errors++;
                          } else {
                            if (data8.turnKind !== void 0) {
                              if (
                                !validate90(data8.turnKind, {
                                  instancePath: instancePath + '/activeTurnNotSteerable/turnKind',
                                  parentData: data8,
                                  parentDataProperty: 'turnKind',
                                  rootData,
                                })
                              ) {
                                vErrors =
                                  vErrors === null
                                    ? validate90.errors
                                    : vErrors.concat(validate90.errors);
                                errors = vErrors.length;
                              }
                            }
                          }
                        } else {
                          const err29 = {
                            instancePath: instancePath + '/activeTurnNotSteerable',
                            schemaPath: '#/anyOf/5/properties/activeTurnNotSteerable/type',
                            keyword: 'type',
                            params: { type: 'object' },
                            message: 'must be object',
                          };
                          if (vErrors === null) {
                            vErrors = [err29];
                          } else {
                            vErrors.push(err29);
                          }
                          errors++;
                        }
                      }
                    }
                  }
                }
              } else {
                const err30 = {
                  instancePath,
                  schemaPath: '#/anyOf/5/type',
                  keyword: 'type',
                  params: { type: 'object' },
                  message: 'must be object',
                };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            var _valid0 = _errs31 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs37 = errors;
              if (
                typeof data !== 'string' &&
                !(data && typeof data == 'object' && !Array.isArray(data))
              ) {
                const err31 = {
                  instancePath,
                  schemaPath: '#/anyOf/6/type',
                  keyword: 'type',
                  params: { type: schema41.anyOf[6].type },
                  message: 'must be string,object',
                };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
              var _valid0 = _errs37 === errors;
              valid0 = valid0 || _valid0;
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err32 = {
      instancePath,
      schemaPath: '#/anyOf',
      keyword: 'anyOf',
      params: {},
      message: 'must match a schema in anyOf',
    };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
    validate89.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate89.errors = vErrors;
  return errors === 0;
}
var schema43 = {
  properties: {
    detailedExplanation: {
      description: 'A substantive localized explanation is required before offering continuation.',
      type: ['string', 'null'],
    },
    errorType: {
      description: 'Open-ended classification; clients must accept categories added by Responses.',
      type: ['string', 'null'],
    },
    reviewTarget: {
      description:
        'Opaque server-issued block target. Presence alone does not enable target-based continuation.',
      type: ['string', 'null'],
    },
    steer: {
      anyOf: [{ $ref: '#/definitions/v2/MisalignmentSteer' }, { type: 'null' }],
      description:
        "Instruction to submit as the next turn's user input if continuation is confirmed.",
    },
  },
  type: 'object',
};
function validate94(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = 'message')) {
        validate94.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.message !== void 0) {
          if (typeof data.message !== 'string') {
            validate94.errors = [
              {
                instancePath: instancePath + '/message',
                schemaPath: '#/properties/message/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
        }
      }
    } else {
      validate94.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate94.errors = vErrors;
  return errors === 0;
}
function validate93(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.detailedExplanation !== void 0) {
        let data0 = data.detailedExplanation;
        const _errs1 = errors;
        if (typeof data0 !== 'string' && data0 !== null) {
          validate93.errors = [
            {
              instancePath: instancePath + '/detailedExplanation',
              schemaPath: '#/properties/detailedExplanation/type',
              keyword: 'type',
              params: { type: schema43.properties.detailedExplanation.type },
              message: 'must be string,null',
            },
          ];
          return false;
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.errorType !== void 0) {
          let data1 = data.errorType;
          const _errs3 = errors;
          if (typeof data1 !== 'string' && data1 !== null) {
            validate93.errors = [
              {
                instancePath: instancePath + '/errorType',
                schemaPath: '#/properties/errorType/type',
                keyword: 'type',
                params: { type: schema43.properties.errorType.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs3 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.reviewTarget !== void 0) {
            let data2 = data.reviewTarget;
            const _errs5 = errors;
            if (typeof data2 !== 'string' && data2 !== null) {
              validate93.errors = [
                {
                  instancePath: instancePath + '/reviewTarget',
                  schemaPath: '#/properties/reviewTarget/type',
                  keyword: 'type',
                  params: { type: schema43.properties.reviewTarget.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs5 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.steer !== void 0) {
              let data3 = data.steer;
              const _errs7 = errors;
              const _errs8 = errors;
              let valid1 = false;
              const _errs9 = errors;
              if (
                !validate94(data3, {
                  instancePath: instancePath + '/steer',
                  parentData: data,
                  parentDataProperty: 'steer',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate94.errors : vErrors.concat(validate94.errors);
                errors = vErrors.length;
              }
              var _valid0 = _errs9 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs10 = errors;
                if (data3 !== null) {
                  const err0 = {
                    instancePath: instancePath + '/steer',
                    schemaPath: '#/properties/steer/anyOf/1/type',
                    keyword: 'type',
                    params: { type: 'null' },
                    message: 'must be null',
                  };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var _valid0 = _errs10 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err1 = {
                  instancePath: instancePath + '/steer',
                  schemaPath: '#/properties/steer/anyOf',
                  keyword: 'anyOf',
                  params: {},
                  message: 'must match a schema in anyOf',
                };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
                validate93.errors = vErrors;
                return false;
              } else {
                errors = _errs8;
                if (vErrors !== null) {
                  if (_errs8) {
                    vErrors.length = _errs8;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs7 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate93.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate93.errors = vErrors;
  return errors === 0;
}
function validate88(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = 'message')) {
        validate88.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.additionalDetails !== void 0) {
          let data0 = data.additionalDetails;
          const _errs1 = errors;
          if (typeof data0 !== 'string' && data0 !== null) {
            validate88.errors = [
              {
                instancePath: instancePath + '/additionalDetails',
                schemaPath: '#/properties/additionalDetails/type',
                keyword: 'type',
                params: { type: schema40.properties.additionalDetails.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.codexErrorInfo !== void 0) {
            let data1 = data.codexErrorInfo;
            const _errs3 = errors;
            const _errs4 = errors;
            let valid1 = false;
            const _errs5 = errors;
            if (
              !validate89(data1, {
                instancePath: instancePath + '/codexErrorInfo',
                parentData: data,
                parentDataProperty: 'codexErrorInfo',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate89.errors : vErrors.concat(validate89.errors);
              errors = vErrors.length;
            }
            var _valid0 = _errs5 === errors;
            valid1 = valid1 || _valid0;
            if (!valid1) {
              const _errs6 = errors;
              if (data1 !== null) {
                const err0 = {
                  instancePath: instancePath + '/codexErrorInfo',
                  schemaPath: '#/properties/codexErrorInfo/anyOf/1/type',
                  keyword: 'type',
                  params: { type: 'null' },
                  message: 'must be null',
                };
                if (vErrors === null) {
                  vErrors = [err0];
                } else {
                  vErrors.push(err0);
                }
                errors++;
              }
              var _valid0 = _errs6 === errors;
              valid1 = valid1 || _valid0;
            }
            if (!valid1) {
              const err1 = {
                instancePath: instancePath + '/codexErrorInfo',
                schemaPath: '#/properties/codexErrorInfo/anyOf',
                keyword: 'anyOf',
                params: {},
                message: 'must match a schema in anyOf',
              };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
              validate88.errors = vErrors;
              return false;
            } else {
              errors = _errs4;
              if (vErrors !== null) {
                if (_errs4) {
                  vErrors.length = _errs4;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.message !== void 0) {
              const _errs8 = errors;
              if (typeof data.message !== 'string') {
                validate88.errors = [
                  {
                    instancePath: instancePath + '/message',
                    schemaPath: '#/properties/message/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.misalignment !== void 0) {
                let data3 = data.misalignment;
                const _errs10 = errors;
                const _errs11 = errors;
                let valid2 = false;
                const _errs12 = errors;
                if (
                  !validate93(data3, {
                    instancePath: instancePath + '/misalignment',
                    parentData: data,
                    parentDataProperty: 'misalignment',
                    rootData,
                  })
                ) {
                  vErrors =
                    vErrors === null ? validate93.errors : vErrors.concat(validate93.errors);
                  errors = vErrors.length;
                }
                var _valid1 = _errs12 === errors;
                valid2 = valid2 || _valid1;
                if (!valid2) {
                  const _errs13 = errors;
                  if (data3 !== null) {
                    const err2 = {
                      instancePath: instancePath + '/misalignment',
                      schemaPath: '#/properties/misalignment/anyOf/1/type',
                      keyword: 'type',
                      params: { type: 'null' },
                      message: 'must be null',
                    };
                    if (vErrors === null) {
                      vErrors = [err2];
                    } else {
                      vErrors.push(err2);
                    }
                    errors++;
                  }
                  var _valid1 = _errs13 === errors;
                  valid2 = valid2 || _valid1;
                }
                if (!valid2) {
                  const err3 = {
                    instancePath: instancePath + '/misalignment',
                    schemaPath: '#/properties/misalignment/anyOf',
                    keyword: 'anyOf',
                    params: {},
                    message: 'must match a schema in anyOf',
                  };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                  validate88.errors = vErrors;
                  return false;
                } else {
                  errors = _errs11;
                  if (vErrors !== null) {
                    if (_errs11) {
                      vErrors.length = _errs11;
                    } else {
                      vErrors = null;
                    }
                  }
                }
                var valid0 = _errs10 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate88.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate88.errors = vErrors;
  return errors === 0;
}
var schema45 = {
  oneOf: [
    {
      properties: {
        clientId: { type: ['string', 'null'] },
        content: { items: { $ref: '#/definitions/v2/UserInput' }, type: 'array' },
        id: { type: 'string' },
        type: { enum: ['userMessage'], title: 'UserMessageThreadItemType', type: 'string' },
      },
      required: ['content', 'id', 'type'],
      title: 'UserMessageThreadItem',
      type: 'object',
    },
    {
      properties: {
        fragments: { items: { $ref: '#/definitions/v2/HookPromptFragment' }, type: 'array' },
        id: { type: 'string' },
        type: { enum: ['hookPrompt'], title: 'HookPromptThreadItemType', type: 'string' },
      },
      required: ['fragments', 'id', 'type'],
      title: 'HookPromptThreadItem',
      type: 'object',
    },
    {
      properties: {
        delivery: {
          anyOf: [{ $ref: '#/definitions/v2/AgentMessageDelivery' }, { type: 'null' }],
          default: null,
        },
        id: { type: 'string' },
        memoryCitation: {
          anyOf: [{ $ref: '#/definitions/v2/MemoryCitation' }, { type: 'null' }],
          default: null,
        },
        phase: {
          anyOf: [{ $ref: '#/definitions/v2/MessagePhase' }, { type: 'null' }],
          default: null,
        },
        questions: {
          default: null,
          items: { $ref: '#/definitions/v2/AsyncUserInputQuestion' },
          type: ['array', 'null'],
        },
        text: { type: 'string' },
        type: { enum: ['agentMessage'], title: 'AgentMessageThreadItemType', type: 'string' },
      },
      required: ['id', 'text', 'type'],
      title: 'AgentMessageThreadItem',
      type: 'object',
    },
    {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        namespace: { type: ['string', 'null'] },
        output: { $ref: '#/definitions/v2/FunctionCallOutputBody' },
        type: {
          enum: ['functionCallOutput'],
          title: 'FunctionCallOutputThreadItemType',
          type: 'string',
        },
      },
      required: ['id', 'name', 'output', 'type'],
      title: 'FunctionCallOutputThreadItem',
      type: 'object',
    },
    {
      description:
        'EXPERIMENTAL - proposed plan item content. The completed plan item is authoritative and may not match the concatenation of `PlanDelta` text.',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        type: { enum: ['plan'], title: 'PlanThreadItemType', type: 'string' },
      },
      required: ['id', 'text', 'type'],
      title: 'PlanThreadItem',
      type: 'object',
    },
    {
      properties: {
        content: { default: [], items: { type: 'string' }, type: 'array' },
        id: { type: 'string' },
        summary: { default: [], items: { type: 'string' }, type: 'array' },
        type: { enum: ['reasoning'], title: 'ReasoningThreadItemType', type: 'string' },
      },
      required: ['id', 'type'],
      title: 'ReasoningThreadItem',
      type: 'object',
    },
    {
      properties: {
        aggregatedOutput: {
          description: "The command's output, aggregated from stdout and stderr.",
          type: ['string', 'null'],
        },
        command: { description: 'The command to be executed.', type: 'string' },
        commandActions: {
          description:
            'A best-effort parsing of the command to understand the action(s) it will perform. This returns a list of CommandAction objects because a single shell command may be composed of many commands piped together.',
          items: { $ref: '#/definitions/v2/CommandAction' },
          type: 'array',
        },
        cwd: {
          allOf: [{ $ref: '#/definitions/v2/LegacyAppPathString' }],
          description: "The command's working directory.",
        },
        durationMs: {
          description: 'The duration of the command execution in milliseconds.',
          format: 'int64',
          type: ['integer', 'null'],
        },
        exitCode: {
          description: "The command's exit code.",
          format: 'int32',
          type: ['integer', 'null'],
        },
        id: { type: 'string' },
        pluginId: {
          default: null,
          description:
            'Trusted first-party plugin id when this command resolves to one plugin script.',
          type: ['string', 'null'],
        },
        processId: {
          description: 'Identifier for the underlying PTY process (when available).',
          type: ['string', 'null'],
        },
        scriptPath: {
          default: null,
          description: 'Safe plugin-relative path when this command resolves to one plugin script.',
          type: ['string', 'null'],
        },
        source: { allOf: [{ $ref: '#/definitions/v2/CommandExecutionSource' }], default: 'agent' },
        status: { $ref: '#/definitions/v2/CommandExecutionStatus' },
        type: {
          enum: ['commandExecution'],
          title: 'CommandExecutionThreadItemType',
          type: 'string',
        },
      },
      required: ['command', 'commandActions', 'cwd', 'id', 'status', 'type'],
      title: 'CommandExecutionThreadItem',
      type: 'object',
    },
    {
      properties: {
        changes: { items: { $ref: '#/definitions/v2/FileUpdateChange' }, type: 'array' },
        id: { type: 'string' },
        status: { $ref: '#/definitions/v2/PatchApplyStatus' },
        type: { enum: ['fileChange'], title: 'FileChangeThreadItemType', type: 'string' },
      },
      required: ['changes', 'id', 'status', 'type'],
      title: 'FileChangeThreadItem',
      type: 'object',
    },
    {
      properties: {
        appContext: {
          anyOf: [{ $ref: '#/definitions/v2/McpToolCallAppContext' }, { type: 'null' }],
        },
        arguments: true,
        durationMs: {
          description: 'The duration of the MCP tool call in milliseconds.',
          format: 'int64',
          type: ['integer', 'null'],
        },
        error: { anyOf: [{ $ref: '#/definitions/v2/McpToolCallError' }, { type: 'null' }] },
        id: { type: 'string' },
        mcpAppResourceUri: {
          description: 'Legacy compatibility field; prefer `mcpAppUi.resourceUri` when available.',
          type: ['string', 'null'],
        },
        mcpAppUi: {
          anyOf: [{ $ref: '#/definitions/v2/McpAppUi' }, { type: 'null' }],
          description:
            'Presentation captured from the invoked descriptor; absent in older history.',
        },
        pluginId: { type: ['string', 'null'] },
        readOnlyHint: { type: ['boolean', 'null'] },
        result: { anyOf: [{ $ref: '#/definitions/v2/McpToolCallResult' }, { type: 'null' }] },
        server: { type: 'string' },
        status: { $ref: '#/definitions/v2/McpToolCallStatus' },
        tool: { type: 'string' },
        type: { enum: ['mcpToolCall'], title: 'McpToolCallThreadItemType', type: 'string' },
      },
      required: ['arguments', 'id', 'server', 'status', 'tool', 'type'],
      title: 'McpToolCallThreadItem',
      type: 'object',
    },
    {
      properties: {
        arguments: true,
        contentItems: {
          items: { $ref: '#/definitions/v2/DynamicToolCallOutputContentItem' },
          type: ['array', 'null'],
        },
        durationMs: {
          description: 'The duration of the dynamic tool call in milliseconds.',
          format: 'int64',
          type: ['integer', 'null'],
        },
        id: { type: 'string' },
        namespace: { type: ['string', 'null'] },
        status: { $ref: '#/definitions/v2/DynamicToolCallStatus' },
        success: { type: ['boolean', 'null'] },
        tool: { type: 'string' },
        type: { enum: ['dynamicToolCall'], title: 'DynamicToolCallThreadItemType', type: 'string' },
      },
      required: ['arguments', 'id', 'status', 'tool', 'type'],
      title: 'DynamicToolCallThreadItem',
      type: 'object',
    },
    {
      properties: {
        agentsStates: {
          additionalProperties: { $ref: '#/definitions/v2/CollabAgentState' },
          description: 'Last known status of the target agents, when available.',
          type: 'object',
        },
        id: { description: 'Unique identifier for this collab tool call.', type: 'string' },
        model: {
          description: 'Model requested for the spawned agent, when applicable.',
          type: ['string', 'null'],
        },
        prompt: {
          description: 'Prompt text sent as part of the collab tool call, when available.',
          type: ['string', 'null'],
        },
        reasoningEffort: {
          anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }],
          description: 'Reasoning effort requested for the spawned agent, when applicable.',
        },
        receiverThreadIds: {
          description:
            'Thread ID of the receiving agent, when applicable. In case of spawn operation, this corresponds to the newly spawned agent.',
          items: { type: 'string' },
          type: 'array',
        },
        senderThreadId: {
          description: 'Thread ID of the agent issuing the collab request.',
          type: 'string',
        },
        status: {
          allOf: [{ $ref: '#/definitions/v2/CollabAgentToolCallStatus' }],
          description: 'Current status of the collab tool call.',
        },
        tool: {
          allOf: [{ $ref: '#/definitions/v2/CollabAgentTool' }],
          description: 'Name of the collab tool that was invoked.',
        },
        type: {
          enum: ['collabAgentToolCall'],
          title: 'CollabAgentToolCallThreadItemType',
          type: 'string',
        },
      },
      required: [
        'agentsStates',
        'id',
        'receiverThreadIds',
        'senderThreadId',
        'status',
        'tool',
        'type',
      ],
      title: 'CollabAgentToolCallThreadItem',
      type: 'object',
    },
    {
      properties: {
        agentPath: { type: 'string' },
        agentThreadId: { type: 'string' },
        id: { type: 'string' },
        kind: { $ref: '#/definitions/v2/SubAgentActivityKind' },
        model: {
          description:
            'Resolved model at sub-agent creation; absent from older records and other activities.',
          type: ['string', 'null'],
        },
        reasoningEffort: {
          anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }],
          description: 'Resolved reasoning effort at sub-agent creation, when known.',
        },
        type: {
          enum: ['subAgentActivity'],
          title: 'SubAgentActivityThreadItemType',
          type: 'string',
        },
      },
      required: ['agentPath', 'agentThreadId', 'id', 'kind', 'type'],
      title: 'SubAgentActivityThreadItem',
      type: 'object',
    },
    {
      properties: {
        action: { anyOf: [{ $ref: '#/definitions/v2/WebSearchAction' }, { type: 'null' }] },
        id: { type: 'string' },
        query: { type: 'string' },
        results: {
          default: null,
          description:
            'Structured search results returned out-of-band by standalone web search.\n\nThese stay as opaque JSON at the extension/app-server boundary so new result fields and result types can pass through without a Codex release.',
          items: true,
          type: ['array', 'null'],
        },
        type: { enum: ['webSearch'], title: 'WebSearchThreadItemType', type: 'string' },
      },
      required: ['id', 'query', 'type'],
      title: 'WebSearchThreadItem',
      type: 'object',
    },
    {
      properties: {
        id: { type: 'string' },
        path: { $ref: '#/definitions/v2/LegacyAppPathString' },
        type: { enum: ['imageView'], title: 'ImageViewThreadItemType', type: 'string' },
      },
      required: ['id', 'path', 'type'],
      title: 'ImageViewThreadItem',
      type: 'object',
    },
    {
      description: 'Display item emitted by the interruptible `clock.sleep` tool.',
      properties: {
        durationMs: { format: 'uint64', minimum: 0, type: 'integer' },
        id: { type: 'string' },
        type: { enum: ['sleep'], title: 'SleepThreadItemType', type: 'string' },
      },
      required: ['durationMs', 'id', 'type'],
      title: 'SleepThreadItem',
      type: 'object',
    },
    {
      properties: {
        failure: {
          anyOf: [{ $ref: '#/definitions/v2/ImageGenerationFailure' }, { type: 'null' }],
          default: null,
        },
        id: { type: 'string' },
        result: { type: 'string' },
        revisedPrompt: { type: ['string', 'null'] },
        savedPath: { anyOf: [{ $ref: '#/definitions/v2/AbsolutePathBuf' }, { type: 'null' }] },
        status: { type: 'string' },
        transparentBackground: { default: null, type: ['boolean', 'null'] },
        type: { enum: ['imageGeneration'], title: 'ImageGenerationThreadItemType', type: 'string' },
      },
      required: ['id', 'result', 'status', 'type'],
      title: 'ImageGenerationThreadItem',
      type: 'object',
    },
    {
      properties: {
        id: { type: 'string' },
        review: { type: 'string' },
        type: {
          enum: ['enteredReviewMode'],
          title: 'EnteredReviewModeThreadItemType',
          type: 'string',
        },
      },
      required: ['id', 'review', 'type'],
      title: 'EnteredReviewModeThreadItem',
      type: 'object',
    },
    {
      properties: {
        id: { type: 'string' },
        review: { type: 'string' },
        type: {
          enum: ['exitedReviewMode'],
          title: 'ExitedReviewModeThreadItemType',
          type: 'string',
        },
      },
      required: ['id', 'review', 'type'],
      title: 'ExitedReviewModeThreadItem',
      type: 'object',
    },
    {
      properties: {
        id: { type: 'string' },
        type: {
          enum: ['contextCompaction'],
          title: 'ContextCompactionThreadItemType',
          type: 'string',
        },
      },
      required: ['id', 'type'],
      title: 'ContextCompactionThreadItem',
      type: 'object',
    },
  ],
};
var schema46 = {
  oneOf: [
    {
      properties: {
        text: { type: 'string' },
        text_elements: {
          default: [],
          description: 'UI-defined spans within `text` used to render or persist special elements.',
          items: { $ref: '#/definitions/v2/TextElement' },
          type: 'array',
        },
        type: { enum: ['text'], title: 'TextUserInputType', type: 'string' },
      },
      required: ['text', 'type'],
      title: 'TextUserInput',
      type: 'object',
    },
    {
      anyOf: [
        {
          properties: { url: { type: 'string' } },
          required: ['url'],
          title: 'UrlUserInput',
          type: 'object',
        },
        {
          properties: { fileId: { type: 'string' } },
          required: ['fileId'],
          title: 'FileIdUserInput',
          type: 'object',
        },
      ],
      properties: {
        detail: {
          anyOf: [{ $ref: '#/definitions/v2/ImageDetail' }, { type: 'null' }],
          default: null,
        },
        type: { enum: ['image'], title: 'ImageUserInputType', type: 'string' },
      },
      required: ['type'],
      title: 'ImageUserInput',
      type: 'object',
    },
    {
      properties: {
        detail: {
          anyOf: [{ $ref: '#/definitions/v2/ImageDetail' }, { type: 'null' }],
          default: null,
        },
        path: { type: 'string' },
        type: { enum: ['localImage'], title: 'LocalImageUserInputType', type: 'string' },
      },
      required: ['path', 'type'],
      title: 'LocalImageUserInput',
      type: 'object',
    },
    {
      properties: {
        type: { enum: ['audio'], title: 'AudioUserInputType', type: 'string' },
        url: { type: 'string' },
      },
      required: ['type', 'url'],
      title: 'AudioUserInput',
      type: 'object',
    },
    {
      properties: {
        path: { type: 'string' },
        type: { enum: ['localAudio'], title: 'LocalAudioUserInputType', type: 'string' },
      },
      required: ['path', 'type'],
      title: 'LocalAudioUserInput',
      type: 'object',
    },
    {
      properties: {
        name: { type: 'string' },
        path: { type: 'string' },
        type: { enum: ['skill'], title: 'SkillUserInputType', type: 'string' },
      },
      required: ['name', 'path', 'type'],
      title: 'SkillUserInput',
      type: 'object',
    },
    {
      properties: {
        name: { type: 'string' },
        path: { type: 'string' },
        type: { enum: ['mention'], title: 'MentionUserInputType', type: 'string' },
      },
      required: ['name', 'path', 'type'],
      title: 'MentionUserInput',
      type: 'object',
    },
  ],
};
var schema47 = {
  properties: {
    byteRange: {
      allOf: [{ $ref: '#/definitions/v2/ByteRange' }],
      description: 'Byte range in the parent `text` buffer that this element occupies.',
    },
    placeholder: {
      description: 'Optional human-readable placeholder for the element, displayed in the UI.',
      type: ['string', 'null'],
    },
  },
  required: ['byteRange'],
  type: 'object',
};
function validate101(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.end === void 0 && (missing0 = 'end')) ||
        (data.start === void 0 && (missing0 = 'start'))
      ) {
        validate101.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.end !== void 0) {
          let data0 = data.end;
          const _errs1 = errors;
          if (!(typeof data0 == 'number' && !(data0 % 1) && !isNaN(data0))) {
            validate101.errors = [
              {
                instancePath: instancePath + '/end',
                schemaPath: '#/properties/end/type',
                keyword: 'type',
                params: { type: 'integer' },
                message: 'must be integer',
              },
            ];
            return false;
          }
          if (errors === _errs1) {
            if (typeof data0 == 'number') {
              if (data0 < 0 || isNaN(data0)) {
                validate101.errors = [
                  {
                    instancePath: instancePath + '/end',
                    schemaPath: '#/properties/end/minimum',
                    keyword: 'minimum',
                    params: { comparison: '>=', limit: 0 },
                    message: 'must be >= 0',
                  },
                ];
                return false;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.start !== void 0) {
            let data1 = data.start;
            const _errs3 = errors;
            if (!(typeof data1 == 'number' && !(data1 % 1) && !isNaN(data1))) {
              validate101.errors = [
                {
                  instancePath: instancePath + '/start',
                  schemaPath: '#/properties/start/type',
                  keyword: 'type',
                  params: { type: 'integer' },
                  message: 'must be integer',
                },
              ];
              return false;
            }
            if (errors === _errs3) {
              if (typeof data1 == 'number') {
                if (data1 < 0 || isNaN(data1)) {
                  validate101.errors = [
                    {
                      instancePath: instancePath + '/start',
                      schemaPath: '#/properties/start/minimum',
                      keyword: 'minimum',
                      params: { comparison: '>=', limit: 0 },
                      message: 'must be >= 0',
                    },
                  ];
                  return false;
                }
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate101.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate101.errors = vErrors;
  return errors === 0;
}
function validate100(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.byteRange === void 0 && (missing0 = 'byteRange')) {
        validate100.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.byteRange !== void 0) {
          const _errs1 = errors;
          if (
            !validate101(data.byteRange, {
              instancePath: instancePath + '/byteRange',
              parentData: data,
              parentDataProperty: 'byteRange',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate101.errors : vErrors.concat(validate101.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.placeholder !== void 0) {
            let data1 = data.placeholder;
            const _errs3 = errors;
            if (typeof data1 !== 'string' && data1 !== null) {
              validate100.errors = [
                {
                  instancePath: instancePath + '/placeholder',
                  schemaPath: '#/properties/placeholder/type',
                  keyword: 'type',
                  params: { type: schema47.properties.placeholder.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate100.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate100.errors = vErrors;
  return errors === 0;
}
var schema49 = { enum: ['auto', 'low', 'high', 'original'], type: 'string' };
function validate104(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate104.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'auto' || data === 'low' || data === 'high' || data === 'original')) {
    validate104.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema49.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate104.errors = vErrors;
  return errors === 0;
}
function validate99(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.text === void 0 && (missing0 = 'text')) ||
        (data.type === void 0 && (missing0 = 'type'))
      ) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.text !== void 0) {
          const _errs3 = errors;
          if (typeof data.text !== 'string') {
            const err1 = {
              instancePath: instancePath + '/text',
              schemaPath: '#/oneOf/0/properties/text/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.text_elements !== void 0) {
            let data1 = data.text_elements;
            const _errs5 = errors;
            if (errors === _errs5) {
              if (Array.isArray(data1)) {
                var valid2 = true;
                const len0 = data1.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  const _errs7 = errors;
                  if (
                    !validate100(data1[i0], {
                      instancePath: instancePath + '/text_elements/' + i0,
                      parentData: data1,
                      parentDataProperty: i0,
                      rootData,
                    })
                  ) {
                    vErrors =
                      vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
                    errors = vErrors.length;
                  }
                  var valid2 = _errs7 === errors;
                  if (!valid2) {
                    break;
                  }
                }
              } else {
                const err2 = {
                  instancePath: instancePath + '/text_elements',
                  schemaPath: '#/oneOf/0/properties/text_elements/type',
                  keyword: 'type',
                  params: { type: 'array' },
                  message: 'must be array',
                };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.type !== void 0) {
              let data3 = data.type;
              const _errs8 = errors;
              if (typeof data3 !== 'string') {
                const err3 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/0/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              if (!(data3 === 'text')) {
                const err4 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/0/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema46.oneOf[0].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var valid1 = _errs8 === errors;
            } else {
              var valid1 = true;
            }
          }
        }
      }
    } else {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  const _errs12 = errors;
  let valid3 = false;
  const _errs13 = errors;
  if (errors === _errs13) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (data.url === void 0 && (missing1 = 'url')) {
        const err6 = {
          instancePath,
          schemaPath: '#/oneOf/1/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        if (data.url !== void 0) {
          if (typeof data.url !== 'string') {
            const err7 = {
              instancePath: instancePath + '/url',
              schemaPath: '#/oneOf/1/anyOf/0/properties/url/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      }
    } else {
      const err8 = {
        instancePath,
        schemaPath: '#/oneOf/1/anyOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
  }
  var _valid1 = _errs13 === errors;
  valid3 = valid3 || _valid1;
  if (!valid3) {
    const _errs17 = errors;
    if (errors === _errs17) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.fileId === void 0 && (missing2 = 'fileId')) {
          const err9 = {
            instancePath,
            schemaPath: '#/oneOf/1/anyOf/1/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        } else {
          if (data.fileId !== void 0) {
            if (typeof data.fileId !== 'string') {
              const err10 = {
                instancePath: instancePath + '/fileId',
                schemaPath: '#/oneOf/1/anyOf/1/properties/fileId/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
      } else {
        const err11 = {
          instancePath,
          schemaPath: '#/oneOf/1/anyOf/1/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    var _valid1 = _errs17 === errors;
    valid3 = valid3 || _valid1;
  }
  if (!valid3) {
    const err12 = {
      instancePath,
      schemaPath: '#/oneOf/1/anyOf',
      keyword: 'anyOf',
      params: {},
      message: 'must match a schema in anyOf',
    };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
  } else {
    errors = _errs12;
    if (vErrors !== null) {
      if (_errs12) {
        vErrors.length = _errs12;
      } else {
        vErrors = null;
      }
    }
  }
  if (errors === _errs10) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing3;
      if (data.type === void 0 && (missing3 = 'type')) {
        const err13 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing3 },
          message: "must have required property '" + missing3 + "'",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      } else {
        if (data.detail !== void 0) {
          let data6 = data.detail;
          const _errs21 = errors;
          const _errs22 = errors;
          let valid7 = false;
          const _errs23 = errors;
          if (
            !validate104(data6, {
              instancePath: instancePath + '/detail',
              parentData: data,
              parentDataProperty: 'detail',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
            errors = vErrors.length;
          }
          var _valid2 = _errs23 === errors;
          valid7 = valid7 || _valid2;
          if (!valid7) {
            const _errs24 = errors;
            if (data6 !== null) {
              const err14 = {
                instancePath: instancePath + '/detail',
                schemaPath: '#/oneOf/1/properties/detail/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            var _valid2 = _errs24 === errors;
            valid7 = valid7 || _valid2;
          }
          if (!valid7) {
            const err15 = {
              instancePath: instancePath + '/detail',
              schemaPath: '#/oneOf/1/properties/detail/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          } else {
            errors = _errs22;
            if (vErrors !== null) {
              if (_errs22) {
                vErrors.length = _errs22;
              } else {
                vErrors = null;
              }
            }
          }
          var valid6 = _errs21 === errors;
        } else {
          var valid6 = true;
        }
        if (valid6) {
          if (data.type !== void 0) {
            let data7 = data.type;
            const _errs26 = errors;
            if (typeof data7 !== 'string') {
              const err16 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (!(data7 === 'image')) {
              const err17 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema46.oneOf[1].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            var valid6 = _errs26 === errors;
          } else {
            var valid6 = true;
          }
        }
      }
    } else {
      const err18 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err18];
      } else {
        vErrors.push(err18);
      }
      errors++;
    }
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs28 = errors;
    if (errors === _errs28) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing4;
        if (
          (data.path === void 0 && (missing4 = 'path')) ||
          (data.type === void 0 && (missing4 = 'type'))
        ) {
          const err19 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing4 },
            message: "must have required property '" + missing4 + "'",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        } else {
          if (data.detail !== void 0) {
            let data8 = data.detail;
            const _errs30 = errors;
            const _errs31 = errors;
            let valid9 = false;
            const _errs32 = errors;
            if (
              !validate104(data8, {
                instancePath: instancePath + '/detail',
                parentData: data,
                parentDataProperty: 'detail',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
              errors = vErrors.length;
            }
            var _valid3 = _errs32 === errors;
            valid9 = valid9 || _valid3;
            if (!valid9) {
              const _errs33 = errors;
              if (data8 !== null) {
                const err20 = {
                  instancePath: instancePath + '/detail',
                  schemaPath: '#/oneOf/2/properties/detail/anyOf/1/type',
                  keyword: 'type',
                  params: { type: 'null' },
                  message: 'must be null',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              var _valid3 = _errs33 === errors;
              valid9 = valid9 || _valid3;
            }
            if (!valid9) {
              const err21 = {
                instancePath: instancePath + '/detail',
                schemaPath: '#/oneOf/2/properties/detail/anyOf',
                keyword: 'anyOf',
                params: {},
                message: 'must match a schema in anyOf',
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            } else {
              errors = _errs31;
              if (vErrors !== null) {
                if (_errs31) {
                  vErrors.length = _errs31;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid8 = _errs30 === errors;
          } else {
            var valid8 = true;
          }
          if (valid8) {
            if (data.path !== void 0) {
              const _errs35 = errors;
              if (typeof data.path !== 'string') {
                const err22 = {
                  instancePath: instancePath + '/path',
                  schemaPath: '#/oneOf/2/properties/path/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              var valid8 = _errs35 === errors;
            } else {
              var valid8 = true;
            }
            if (valid8) {
              if (data.type !== void 0) {
                let data10 = data.type;
                const _errs37 = errors;
                if (typeof data10 !== 'string') {
                  const err23 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/2/properties/type/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                if (!(data10 === 'localImage')) {
                  const err24 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/2/properties/type/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema46.oneOf[2].properties.type.enum },
                    message: 'must be equal to one of the allowed values',
                  };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                var valid8 = _errs37 === errors;
              } else {
                var valid8 = true;
              }
            }
          }
        }
      } else {
        const err25 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    var _valid0 = _errs28 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs39 = errors;
      if (errors === _errs39) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing5;
          if (
            (data.type === void 0 && (missing5 = 'type')) ||
            (data.url === void 0 && (missing5 = 'url'))
          ) {
            const err26 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing5 },
              message: "must have required property '" + missing5 + "'",
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          } else {
            if (data.type !== void 0) {
              let data11 = data.type;
              const _errs41 = errors;
              if (typeof data11 !== 'string') {
                const err27 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/3/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              if (!(data11 === 'audio')) {
                const err28 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/3/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema46.oneOf[3].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
              var valid10 = _errs41 === errors;
            } else {
              var valid10 = true;
            }
            if (valid10) {
              if (data.url !== void 0) {
                const _errs43 = errors;
                if (typeof data.url !== 'string') {
                  const err29 = {
                    instancePath: instancePath + '/url',
                    schemaPath: '#/oneOf/3/properties/url/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                var valid10 = _errs43 === errors;
              } else {
                var valid10 = true;
              }
            }
          }
        } else {
          const err30 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
      var _valid0 = _errs39 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs45 = errors;
        if (errors === _errs45) {
          if (data && typeof data == 'object' && !Array.isArray(data)) {
            let missing6;
            if (
              (data.path === void 0 && (missing6 = 'path')) ||
              (data.type === void 0 && (missing6 = 'type'))
            ) {
              const err31 = {
                instancePath,
                schemaPath: '#/oneOf/4/required',
                keyword: 'required',
                params: { missingProperty: missing6 },
                message: "must have required property '" + missing6 + "'",
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            } else {
              if (data.path !== void 0) {
                const _errs47 = errors;
                if (typeof data.path !== 'string') {
                  const err32 = {
                    instancePath: instancePath + '/path',
                    schemaPath: '#/oneOf/4/properties/path/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                var valid11 = _errs47 === errors;
              } else {
                var valid11 = true;
              }
              if (valid11) {
                if (data.type !== void 0) {
                  let data14 = data.type;
                  const _errs49 = errors;
                  if (typeof data14 !== 'string') {
                    const err33 = {
                      instancePath: instancePath + '/type',
                      schemaPath: '#/oneOf/4/properties/type/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    };
                    if (vErrors === null) {
                      vErrors = [err33];
                    } else {
                      vErrors.push(err33);
                    }
                    errors++;
                  }
                  if (!(data14 === 'localAudio')) {
                    const err34 = {
                      instancePath: instancePath + '/type',
                      schemaPath: '#/oneOf/4/properties/type/enum',
                      keyword: 'enum',
                      params: { allowedValues: schema46.oneOf[4].properties.type.enum },
                      message: 'must be equal to one of the allowed values',
                    };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                  var valid11 = _errs49 === errors;
                } else {
                  var valid11 = true;
                }
              }
            }
          } else {
            const err35 = {
              instancePath,
              schemaPath: '#/oneOf/4/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
        var _valid0 = _errs45 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs51 = errors;
          if (errors === _errs51) {
            if (data && typeof data == 'object' && !Array.isArray(data)) {
              let missing7;
              if (
                (data.name === void 0 && (missing7 = 'name')) ||
                (data.path === void 0 && (missing7 = 'path')) ||
                (data.type === void 0 && (missing7 = 'type'))
              ) {
                const err36 = {
                  instancePath,
                  schemaPath: '#/oneOf/5/required',
                  keyword: 'required',
                  params: { missingProperty: missing7 },
                  message: "must have required property '" + missing7 + "'",
                };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              } else {
                if (data.name !== void 0) {
                  const _errs53 = errors;
                  if (typeof data.name !== 'string') {
                    const err37 = {
                      instancePath: instancePath + '/name',
                      schemaPath: '#/oneOf/5/properties/name/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                  var valid12 = _errs53 === errors;
                } else {
                  var valid12 = true;
                }
                if (valid12) {
                  if (data.path !== void 0) {
                    const _errs55 = errors;
                    if (typeof data.path !== 'string') {
                      const err38 = {
                        instancePath: instancePath + '/path',
                        schemaPath: '#/oneOf/5/properties/path/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err38];
                      } else {
                        vErrors.push(err38);
                      }
                      errors++;
                    }
                    var valid12 = _errs55 === errors;
                  } else {
                    var valid12 = true;
                  }
                  if (valid12) {
                    if (data.type !== void 0) {
                      let data17 = data.type;
                      const _errs57 = errors;
                      if (typeof data17 !== 'string') {
                        const err39 = {
                          instancePath: instancePath + '/type',
                          schemaPath: '#/oneOf/5/properties/type/type',
                          keyword: 'type',
                          params: { type: 'string' },
                          message: 'must be string',
                        };
                        if (vErrors === null) {
                          vErrors = [err39];
                        } else {
                          vErrors.push(err39);
                        }
                        errors++;
                      }
                      if (!(data17 === 'skill')) {
                        const err40 = {
                          instancePath: instancePath + '/type',
                          schemaPath: '#/oneOf/5/properties/type/enum',
                          keyword: 'enum',
                          params: { allowedValues: schema46.oneOf[5].properties.type.enum },
                          message: 'must be equal to one of the allowed values',
                        };
                        if (vErrors === null) {
                          vErrors = [err40];
                        } else {
                          vErrors.push(err40);
                        }
                        errors++;
                      }
                      var valid12 = _errs57 === errors;
                    } else {
                      var valid12 = true;
                    }
                  }
                }
              }
            } else {
              const err41 = {
                instancePath,
                schemaPath: '#/oneOf/5/type',
                keyword: 'type',
                params: { type: 'object' },
                message: 'must be object',
              };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          var _valid0 = _errs51 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs59 = errors;
            if (errors === _errs59) {
              if (data && typeof data == 'object' && !Array.isArray(data)) {
                let missing8;
                if (
                  (data.name === void 0 && (missing8 = 'name')) ||
                  (data.path === void 0 && (missing8 = 'path')) ||
                  (data.type === void 0 && (missing8 = 'type'))
                ) {
                  const err42 = {
                    instancePath,
                    schemaPath: '#/oneOf/6/required',
                    keyword: 'required',
                    params: { missingProperty: missing8 },
                    message: "must have required property '" + missing8 + "'",
                  };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                } else {
                  if (data.name !== void 0) {
                    const _errs61 = errors;
                    if (typeof data.name !== 'string') {
                      const err43 = {
                        instancePath: instancePath + '/name',
                        schemaPath: '#/oneOf/6/properties/name/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err43];
                      } else {
                        vErrors.push(err43);
                      }
                      errors++;
                    }
                    var valid13 = _errs61 === errors;
                  } else {
                    var valid13 = true;
                  }
                  if (valid13) {
                    if (data.path !== void 0) {
                      const _errs63 = errors;
                      if (typeof data.path !== 'string') {
                        const err44 = {
                          instancePath: instancePath + '/path',
                          schemaPath: '#/oneOf/6/properties/path/type',
                          keyword: 'type',
                          params: { type: 'string' },
                          message: 'must be string',
                        };
                        if (vErrors === null) {
                          vErrors = [err44];
                        } else {
                          vErrors.push(err44);
                        }
                        errors++;
                      }
                      var valid13 = _errs63 === errors;
                    } else {
                      var valid13 = true;
                    }
                    if (valid13) {
                      if (data.type !== void 0) {
                        let data20 = data.type;
                        const _errs65 = errors;
                        if (typeof data20 !== 'string') {
                          const err45 = {
                            instancePath: instancePath + '/type',
                            schemaPath: '#/oneOf/6/properties/type/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          };
                          if (vErrors === null) {
                            vErrors = [err45];
                          } else {
                            vErrors.push(err45);
                          }
                          errors++;
                        }
                        if (!(data20 === 'mention')) {
                          const err46 = {
                            instancePath: instancePath + '/type',
                            schemaPath: '#/oneOf/6/properties/type/enum',
                            keyword: 'enum',
                            params: { allowedValues: schema46.oneOf[6].properties.type.enum },
                            message: 'must be equal to one of the allowed values',
                          };
                          if (vErrors === null) {
                            vErrors = [err46];
                          } else {
                            vErrors.push(err46);
                          }
                          errors++;
                        }
                        var valid13 = _errs65 === errors;
                      } else {
                        var valid13 = true;
                      }
                    }
                  }
                }
              } else {
                const err47 = {
                  instancePath,
                  schemaPath: '#/oneOf/6/type',
                  keyword: 'type',
                  params: { type: 'object' },
                  message: 'must be object',
                };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
            var _valid0 = _errs59 === errors;
            if (_valid0 && valid0) {
              valid0 = false;
              passing0 = [passing0, 6];
            } else {
              if (_valid0) {
                valid0 = true;
                passing0 = 6;
              }
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err48 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err48];
    } else {
      vErrors.push(err48);
    }
    errors++;
    validate99.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate99.errors = vErrors;
  return errors === 0;
}
function validate108(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.hookRunId === void 0 && (missing0 = 'hookRunId')) ||
        (data.text === void 0 && (missing0 = 'text'))
      ) {
        validate108.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.hookRunId !== void 0) {
          const _errs1 = errors;
          if (typeof data.hookRunId !== 'string') {
            validate108.errors = [
              {
                instancePath: instancePath + '/hookRunId',
                schemaPath: '#/properties/hookRunId/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.text !== void 0) {
            const _errs3 = errors;
            if (typeof data.text !== 'string') {
              validate108.errors = [
                {
                  instancePath: instancePath + '/text',
                  schemaPath: '#/properties/text/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate108.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate108.errors = vErrors;
  return errors === 0;
}
var schema51 = { enum: ['async'], type: 'string' };
function validate110(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate110.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'async')) {
    validate110.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema51.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate110.errors = vErrors;
  return errors === 0;
}
function validate113(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.lineEnd === void 0 && (missing0 = 'lineEnd')) ||
        (data.lineStart === void 0 && (missing0 = 'lineStart')) ||
        (data.note === void 0 && (missing0 = 'note')) ||
        (data.path === void 0 && (missing0 = 'path'))
      ) {
        validate113.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.lineEnd !== void 0) {
          let data0 = data.lineEnd;
          const _errs1 = errors;
          if (!(typeof data0 == 'number' && !(data0 % 1) && !isNaN(data0))) {
            validate113.errors = [
              {
                instancePath: instancePath + '/lineEnd',
                schemaPath: '#/properties/lineEnd/type',
                keyword: 'type',
                params: { type: 'integer' },
                message: 'must be integer',
              },
            ];
            return false;
          }
          if (errors === _errs1) {
            if (typeof data0 == 'number') {
              if (data0 < 0 || isNaN(data0)) {
                validate113.errors = [
                  {
                    instancePath: instancePath + '/lineEnd',
                    schemaPath: '#/properties/lineEnd/minimum',
                    keyword: 'minimum',
                    params: { comparison: '>=', limit: 0 },
                    message: 'must be >= 0',
                  },
                ];
                return false;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.lineStart !== void 0) {
            let data1 = data.lineStart;
            const _errs3 = errors;
            if (!(typeof data1 == 'number' && !(data1 % 1) && !isNaN(data1))) {
              validate113.errors = [
                {
                  instancePath: instancePath + '/lineStart',
                  schemaPath: '#/properties/lineStart/type',
                  keyword: 'type',
                  params: { type: 'integer' },
                  message: 'must be integer',
                },
              ];
              return false;
            }
            if (errors === _errs3) {
              if (typeof data1 == 'number') {
                if (data1 < 0 || isNaN(data1)) {
                  validate113.errors = [
                    {
                      instancePath: instancePath + '/lineStart',
                      schemaPath: '#/properties/lineStart/minimum',
                      keyword: 'minimum',
                      params: { comparison: '>=', limit: 0 },
                      message: 'must be >= 0',
                    },
                  ];
                  return false;
                }
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.note !== void 0) {
              const _errs5 = errors;
              if (typeof data.note !== 'string') {
                validate113.errors = [
                  {
                    instancePath: instancePath + '/note',
                    schemaPath: '#/properties/note/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.path !== void 0) {
                const _errs7 = errors;
                if (typeof data.path !== 'string') {
                  validate113.errors = [
                    {
                      instancePath: instancePath + '/path',
                      schemaPath: '#/properties/path/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate113.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate113.errors = vErrors;
  return errors === 0;
}
function validate112(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.entries === void 0 && (missing0 = 'entries')) ||
        (data.threadIds === void 0 && (missing0 = 'threadIds'))
      ) {
        validate112.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.entries !== void 0) {
          let data0 = data.entries;
          const _errs1 = errors;
          if (errors === _errs1) {
            if (Array.isArray(data0)) {
              var valid1 = true;
              const len0 = data0.length;
              for (let i0 = 0; i0 < len0; i0++) {
                const _errs3 = errors;
                if (
                  !validate113(data0[i0], {
                    instancePath: instancePath + '/entries/' + i0,
                    parentData: data0,
                    parentDataProperty: i0,
                    rootData,
                  })
                ) {
                  vErrors =
                    vErrors === null ? validate113.errors : vErrors.concat(validate113.errors);
                  errors = vErrors.length;
                }
                var valid1 = _errs3 === errors;
                if (!valid1) {
                  break;
                }
              }
            } else {
              validate112.errors = [
                {
                  instancePath: instancePath + '/entries',
                  schemaPath: '#/properties/entries/type',
                  keyword: 'type',
                  params: { type: 'array' },
                  message: 'must be array',
                },
              ];
              return false;
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.threadIds !== void 0) {
            let data2 = data.threadIds;
            const _errs4 = errors;
            if (errors === _errs4) {
              if (Array.isArray(data2)) {
                var valid2 = true;
                const len1 = data2.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  const _errs6 = errors;
                  if (typeof data2[i1] !== 'string') {
                    validate112.errors = [
                      {
                        instancePath: instancePath + '/threadIds/' + i1,
                        schemaPath: '#/properties/threadIds/items/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      },
                    ];
                    return false;
                  }
                  var valid2 = _errs6 === errors;
                  if (!valid2) {
                    break;
                  }
                }
              } else {
                validate112.errors = [
                  {
                    instancePath: instancePath + '/threadIds',
                    schemaPath: '#/properties/threadIds/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                  },
                ];
                return false;
              }
            }
            var valid0 = _errs4 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate112.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate112.errors = vErrors;
  return errors === 0;
}
var schema54 = {
  description:
    'Classifies assistant text as commentary, a partial answer, or a terminal answer.\n\nProviders do not emit this consistently, so callers must treat `None` as "phase unknown" and keep compatibility behavior for legacy models.',
  oneOf: [
    {
      description:
        'Mid-turn assistant text (for example preamble/progress narration).\n\nAdditional tool calls or assistant output may follow before turn completion.',
      enum: ['commentary'],
      type: 'string',
    },
    {
      description: 'Stable answer text that may be followed by more assistant output or tools.',
      enum: ['partial_answer'],
      type: 'string',
    },
    {
      description: "The assistant's declared terminal answer text for the current turn.",
      enum: ['final_answer'],
      type: 'string',
    },
  ],
};
function validate116(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === 'commentary')) {
    const err1 = {
      instancePath,
      schemaPath: '#/oneOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema54.oneOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (typeof data !== 'string') {
    const err2 = {
      instancePath,
      schemaPath: '#/oneOf/1/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  if (!(data === 'partial_answer')) {
    const err3 = {
      instancePath,
      schemaPath: '#/oneOf/1/enum',
      keyword: 'enum',
      params: { allowedValues: schema54.oneOf[1].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs5 = errors;
    if (typeof data !== 'string') {
      const err4 = {
        instancePath,
        schemaPath: '#/oneOf/2/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (!(data === 'final_answer')) {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/2/enum',
        keyword: 'enum',
        params: { allowedValues: schema54.oneOf[2].enum },
        message: 'must be equal to one of the allowed values',
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    var _valid0 = _errs5 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err6 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
    validate116.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate116.errors = vErrors;
  return errors === 0;
}
var schema55 = {
  additionalProperties: false,
  properties: {
    options: { items: { type: 'string' }, type: ['array', 'null'] },
    title: { type: 'string' },
  },
  required: ['title'],
  type: 'object',
};
function validate118(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.title === void 0 && (missing0 = 'title')) {
        validate118.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === 'options' || key0 === 'title')) {
            validate118.errors = [
              {
                instancePath,
                schemaPath: '#/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key0 },
                message: 'must NOT have additional properties',
              },
            ];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.options !== void 0) {
            let data0 = data.options;
            const _errs2 = errors;
            if (!Array.isArray(data0) && data0 !== null) {
              validate118.errors = [
                {
                  instancePath: instancePath + '/options',
                  schemaPath: '#/properties/options/type',
                  keyword: 'type',
                  params: { type: schema55.properties.options.type },
                  message: 'must be array,null',
                },
              ];
              return false;
            }
            if (errors === _errs2) {
              if (Array.isArray(data0)) {
                var valid1 = true;
                const len0 = data0.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  const _errs4 = errors;
                  if (typeof data0[i0] !== 'string') {
                    validate118.errors = [
                      {
                        instancePath: instancePath + '/options/' + i0,
                        schemaPath: '#/properties/options/items/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      },
                    ];
                    return false;
                  }
                  var valid1 = _errs4 === errors;
                  if (!valid1) {
                    break;
                  }
                }
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.title !== void 0) {
              const _errs6 = errors;
              if (typeof data.title !== 'string') {
                validate118.errors = [
                  {
                    instancePath: instancePath + '/title',
                    schemaPath: '#/properties/title/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs6 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate118.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate118.errors = vErrors;
  return errors === 0;
}
var schema57 = {
  description:
    'Responses API compatible content items that can be returned by a tool call. This is a subset of ContentItem with the types we support as function call outputs.',
  oneOf: [
    {
      properties: {
        text: { type: 'string' },
        type: {
          enum: ['input_text'],
          title: 'InputTextFunctionCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['text', 'type'],
      title: 'InputTextFunctionCallOutputContentItem',
      type: 'object',
    },
    {
      anyOf: [
        {
          properties: { image_url: { type: 'string' } },
          required: ['image_url'],
          title: 'ImageUrlFunctionCallOutputContentItem',
          type: 'object',
        },
        {
          properties: { file_id: { type: 'string' } },
          required: ['file_id'],
          title: 'FileIdFunctionCallOutputContentItem',
          type: 'object',
        },
      ],
      properties: {
        detail: { anyOf: [{ $ref: '#/definitions/v2/ImageDetail' }, { type: 'null' }] },
        type: {
          enum: ['input_image'],
          title: 'InputImageFunctionCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['type'],
      title: 'InputImageFunctionCallOutputContentItem',
      type: 'object',
    },
    {
      properties: {
        audio_url: { type: 'string' },
        type: {
          enum: ['input_audio'],
          title: 'InputAudioFunctionCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['audio_url', 'type'],
      title: 'InputAudioFunctionCallOutputContentItem',
      type: 'object',
    },
    {
      properties: {
        encrypted_content: { type: 'string' },
        type: {
          enum: ['encrypted_content'],
          title: 'EncryptedContentFunctionCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['encrypted_content', 'type'],
      title: 'EncryptedContentFunctionCallOutputContentItem',
      type: 'object',
    },
  ],
};
function validate121(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.text === void 0 && (missing0 = 'text')) ||
        (data.type === void 0 && (missing0 = 'type'))
      ) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.text !== void 0) {
          const _errs3 = errors;
          if (typeof data.text !== 'string') {
            const err1 = {
              instancePath: instancePath + '/text',
              schemaPath: '#/oneOf/0/properties/text/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.type !== void 0) {
            let data1 = data.type;
            const _errs5 = errors;
            if (typeof data1 !== 'string') {
              const err2 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/0/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            if (!(data1 === 'input_text')) {
              const err3 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/0/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema57.oneOf[0].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      const err4 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs7 = errors;
  const _errs9 = errors;
  let valid2 = false;
  const _errs10 = errors;
  if (errors === _errs10) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (data.image_url === void 0 && (missing1 = 'image_url')) {
        const err5 = {
          instancePath,
          schemaPath: '#/oneOf/1/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      } else {
        if (data.image_url !== void 0) {
          if (typeof data.image_url !== 'string') {
            const err6 = {
              instancePath: instancePath + '/image_url',
              schemaPath: '#/oneOf/1/anyOf/0/properties/image_url/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      }
    } else {
      const err7 = {
        instancePath,
        schemaPath: '#/oneOf/1/anyOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid1 = _errs10 === errors;
  valid2 = valid2 || _valid1;
  if (!valid2) {
    const _errs14 = errors;
    if (errors === _errs14) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.file_id === void 0 && (missing2 = 'file_id')) {
          const err8 = {
            instancePath,
            schemaPath: '#/oneOf/1/anyOf/1/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          if (data.file_id !== void 0) {
            if (typeof data.file_id !== 'string') {
              const err9 = {
                instancePath: instancePath + '/file_id',
                schemaPath: '#/oneOf/1/anyOf/1/properties/file_id/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
        }
      } else {
        const err10 = {
          instancePath,
          schemaPath: '#/oneOf/1/anyOf/1/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    var _valid1 = _errs14 === errors;
    valid2 = valid2 || _valid1;
  }
  if (!valid2) {
    const err11 = {
      instancePath,
      schemaPath: '#/oneOf/1/anyOf',
      keyword: 'anyOf',
      params: {},
      message: 'must match a schema in anyOf',
    };
    if (vErrors === null) {
      vErrors = [err11];
    } else {
      vErrors.push(err11);
    }
    errors++;
  } else {
    errors = _errs9;
    if (vErrors !== null) {
      if (_errs9) {
        vErrors.length = _errs9;
      } else {
        vErrors = null;
      }
    }
  }
  if (errors === _errs7) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing3;
      if (data.type === void 0 && (missing3 = 'type')) {
        const err12 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing3 },
          message: "must have required property '" + missing3 + "'",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        if (data.detail !== void 0) {
          let data4 = data.detail;
          const _errs18 = errors;
          const _errs19 = errors;
          let valid6 = false;
          const _errs20 = errors;
          if (
            !validate104(data4, {
              instancePath: instancePath + '/detail',
              parentData: data,
              parentDataProperty: 'detail',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
            errors = vErrors.length;
          }
          var _valid2 = _errs20 === errors;
          valid6 = valid6 || _valid2;
          if (!valid6) {
            const _errs21 = errors;
            if (data4 !== null) {
              const err13 = {
                instancePath: instancePath + '/detail',
                schemaPath: '#/oneOf/1/properties/detail/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            var _valid2 = _errs21 === errors;
            valid6 = valid6 || _valid2;
          }
          if (!valid6) {
            const err14 = {
              instancePath: instancePath + '/detail',
              schemaPath: '#/oneOf/1/properties/detail/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          } else {
            errors = _errs19;
            if (vErrors !== null) {
              if (_errs19) {
                vErrors.length = _errs19;
              } else {
                vErrors = null;
              }
            }
          }
          var valid5 = _errs18 === errors;
        } else {
          var valid5 = true;
        }
        if (valid5) {
          if (data.type !== void 0) {
            let data5 = data.type;
            const _errs23 = errors;
            if (typeof data5 !== 'string') {
              const err15 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (!(data5 === 'input_image')) {
              const err16 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema57.oneOf[1].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            var valid5 = _errs23 === errors;
          } else {
            var valid5 = true;
          }
        }
      }
    } else {
      const err17 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    }
  }
  var _valid0 = _errs7 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs25 = errors;
    if (errors === _errs25) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing4;
        if (
          (data.audio_url === void 0 && (missing4 = 'audio_url')) ||
          (data.type === void 0 && (missing4 = 'type'))
        ) {
          const err18 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing4 },
            message: "must have required property '" + missing4 + "'",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        } else {
          if (data.audio_url !== void 0) {
            const _errs27 = errors;
            if (typeof data.audio_url !== 'string') {
              const err19 = {
                instancePath: instancePath + '/audio_url',
                schemaPath: '#/oneOf/2/properties/audio_url/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            var valid7 = _errs27 === errors;
          } else {
            var valid7 = true;
          }
          if (valid7) {
            if (data.type !== void 0) {
              let data7 = data.type;
              const _errs29 = errors;
              if (typeof data7 !== 'string') {
                const err20 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              if (!(data7 === 'input_audio')) {
                const err21 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema57.oneOf[2].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              var valid7 = _errs29 === errors;
            } else {
              var valid7 = true;
            }
          }
        }
      } else {
        const err22 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    var _valid0 = _errs25 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs31 = errors;
      if (errors === _errs31) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing5;
          if (
            (data.encrypted_content === void 0 && (missing5 = 'encrypted_content')) ||
            (data.type === void 0 && (missing5 = 'type'))
          ) {
            const err23 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing5 },
              message: "must have required property '" + missing5 + "'",
            };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          } else {
            if (data.encrypted_content !== void 0) {
              const _errs33 = errors;
              if (typeof data.encrypted_content !== 'string') {
                const err24 = {
                  instancePath: instancePath + '/encrypted_content',
                  schemaPath: '#/oneOf/3/properties/encrypted_content/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              var valid8 = _errs33 === errors;
            } else {
              var valid8 = true;
            }
            if (valid8) {
              if (data.type !== void 0) {
                let data9 = data.type;
                const _errs35 = errors;
                if (typeof data9 !== 'string') {
                  const err25 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/3/properties/type/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
                if (!(data9 === 'encrypted_content')) {
                  const err26 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/3/properties/type/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema57.oneOf[3].properties.type.enum },
                    message: 'must be equal to one of the allowed values',
                  };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
                var valid8 = _errs35 === errors;
              } else {
                var valid8 = true;
              }
            }
          }
        } else {
          const err27 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      var _valid0 = _errs31 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err28 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err28];
    } else {
      vErrors.push(err28);
    }
    errors++;
    validate121.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate121.errors = vErrors;
  return errors === 0;
}
function validate120(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/anyOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs3 = errors;
    if (errors === _errs3) {
      if (Array.isArray(data)) {
        var valid1 = true;
        const len0 = data.length;
        for (let i0 = 0; i0 < len0; i0++) {
          const _errs5 = errors;
          if (
            !validate121(data[i0], {
              instancePath: instancePath + '/' + i0,
              parentData: data,
              parentDataProperty: i0,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate121.errors : vErrors.concat(validate121.errors);
            errors = vErrors.length;
          }
          var valid1 = _errs5 === errors;
          if (!valid1) {
            break;
          }
        }
      } else {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
  }
  if (!valid0) {
    const err2 = {
      instancePath,
      schemaPath: '#/anyOf',
      keyword: 'anyOf',
      params: {},
      message: 'must match a schema in anyOf',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
    validate120.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate120.errors = vErrors;
  return errors === 0;
}
var schema58 = {
  oneOf: [
    {
      properties: {
        command: { type: 'string' },
        name: { type: 'string' },
        path: { $ref: '#/definitions/v2/LegacyAppPathString' },
        type: { enum: ['read'], title: 'ReadCommandActionType', type: 'string' },
      },
      required: ['command', 'name', 'path', 'type'],
      title: 'ReadCommandAction',
      type: 'object',
    },
    {
      properties: {
        command: { type: 'string' },
        path: { type: ['string', 'null'] },
        type: { enum: ['listFiles'], title: 'ListFilesCommandActionType', type: 'string' },
      },
      required: ['command', 'type'],
      title: 'ListFilesCommandAction',
      type: 'object',
    },
    {
      properties: {
        command: { type: 'string' },
        path: { type: ['string', 'null'] },
        query: { type: ['string', 'null'] },
        type: { enum: ['search'], title: 'SearchCommandActionType', type: 'string' },
      },
      required: ['command', 'type'],
      title: 'SearchCommandAction',
      type: 'object',
    },
    {
      properties: {
        command: { type: 'string' },
        type: { enum: ['unknown'], title: 'UnknownCommandActionType', type: 'string' },
      },
      required: ['command', 'type'],
      title: 'UnknownCommandAction',
      type: 'object',
    },
  ],
};
function validate125(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.command === void 0 && (missing0 = 'command')) ||
        (data.name === void 0 && (missing0 = 'name')) ||
        (data.path === void 0 && (missing0 = 'path')) ||
        (data.type === void 0 && (missing0 = 'type'))
      ) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.command !== void 0) {
          const _errs3 = errors;
          if (typeof data.command !== 'string') {
            const err1 = {
              instancePath: instancePath + '/command',
              schemaPath: '#/oneOf/0/properties/command/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.name !== void 0) {
            const _errs5 = errors;
            if (typeof data.name !== 'string') {
              const err2 = {
                instancePath: instancePath + '/name',
                schemaPath: '#/oneOf/0/properties/name/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.path !== void 0) {
              const _errs7 = errors;
              if (
                !validate54(data.path, {
                  instancePath: instancePath + '/path',
                  parentData: data,
                  parentDataProperty: 'path',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
                errors = vErrors.length;
              }
              var valid1 = _errs7 === errors;
            } else {
              var valid1 = true;
            }
            if (valid1) {
              if (data.type !== void 0) {
                let data3 = data.type;
                const _errs8 = errors;
                if (typeof data3 !== 'string') {
                  const err3 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/0/properties/type/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                }
                if (!(data3 === 'read')) {
                  const err4 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/0/properties/type/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema58.oneOf[0].properties.type.enum },
                    message: 'must be equal to one of the allowed values',
                  };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                var valid1 = _errs8 === errors;
              } else {
                var valid1 = true;
              }
            }
          }
        }
      }
    } else {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (errors === _errs10) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (
        (data.command === void 0 && (missing1 = 'command')) ||
        (data.type === void 0 && (missing1 = 'type'))
      ) {
        const err6 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        if (data.command !== void 0) {
          const _errs12 = errors;
          if (typeof data.command !== 'string') {
            const err7 = {
              instancePath: instancePath + '/command',
              schemaPath: '#/oneOf/1/properties/command/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          var valid2 = _errs12 === errors;
        } else {
          var valid2 = true;
        }
        if (valid2) {
          if (data.path !== void 0) {
            let data5 = data.path;
            const _errs14 = errors;
            if (typeof data5 !== 'string' && data5 !== null) {
              const err8 = {
                instancePath: instancePath + '/path',
                schemaPath: '#/oneOf/1/properties/path/type',
                keyword: 'type',
                params: { type: schema58.oneOf[1].properties.path.type },
                message: 'must be string,null',
              };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            var valid2 = _errs14 === errors;
          } else {
            var valid2 = true;
          }
          if (valid2) {
            if (data.type !== void 0) {
              let data6 = data.type;
              const _errs16 = errors;
              if (typeof data6 !== 'string') {
                const err9 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/1/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
              if (!(data6 === 'listFiles')) {
                const err10 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/1/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema58.oneOf[1].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              var valid2 = _errs16 === errors;
            } else {
              var valid2 = true;
            }
          }
        }
      }
    } else {
      const err11 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (errors === _errs18) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (
          (data.command === void 0 && (missing2 = 'command')) ||
          (data.type === void 0 && (missing2 = 'type'))
        ) {
          const err12 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        } else {
          if (data.command !== void 0) {
            const _errs20 = errors;
            if (typeof data.command !== 'string') {
              const err13 = {
                instancePath: instancePath + '/command',
                schemaPath: '#/oneOf/2/properties/command/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            var valid3 = _errs20 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.path !== void 0) {
              let data8 = data.path;
              const _errs22 = errors;
              if (typeof data8 !== 'string' && data8 !== null) {
                const err14 = {
                  instancePath: instancePath + '/path',
                  schemaPath: '#/oneOf/2/properties/path/type',
                  keyword: 'type',
                  params: { type: schema58.oneOf[2].properties.path.type },
                  message: 'must be string,null',
                };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              var valid3 = _errs22 === errors;
            } else {
              var valid3 = true;
            }
            if (valid3) {
              if (data.query !== void 0) {
                let data9 = data.query;
                const _errs24 = errors;
                if (typeof data9 !== 'string' && data9 !== null) {
                  const err15 = {
                    instancePath: instancePath + '/query',
                    schemaPath: '#/oneOf/2/properties/query/type',
                    keyword: 'type',
                    params: { type: schema58.oneOf[2].properties.query.type },
                    message: 'must be string,null',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                var valid3 = _errs24 === errors;
              } else {
                var valid3 = true;
              }
              if (valid3) {
                if (data.type !== void 0) {
                  let data10 = data.type;
                  const _errs26 = errors;
                  if (typeof data10 !== 'string') {
                    const err16 = {
                      instancePath: instancePath + '/type',
                      schemaPath: '#/oneOf/2/properties/type/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                  if (!(data10 === 'search')) {
                    const err17 = {
                      instancePath: instancePath + '/type',
                      schemaPath: '#/oneOf/2/properties/type/enum',
                      keyword: 'enum',
                      params: { allowedValues: schema58.oneOf[2].properties.type.enum },
                      message: 'must be equal to one of the allowed values',
                    };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  var valid3 = _errs26 === errors;
                } else {
                  var valid3 = true;
                }
              }
            }
          }
        }
      } else {
        const err18 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs28 = errors;
      if (errors === _errs28) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing3;
          if (
            (data.command === void 0 && (missing3 = 'command')) ||
            (data.type === void 0 && (missing3 = 'type'))
          ) {
            const err19 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing3 },
              message: "must have required property '" + missing3 + "'",
            };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          } else {
            if (data.command !== void 0) {
              const _errs30 = errors;
              if (typeof data.command !== 'string') {
                const err20 = {
                  instancePath: instancePath + '/command',
                  schemaPath: '#/oneOf/3/properties/command/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              var valid4 = _errs30 === errors;
            } else {
              var valid4 = true;
            }
            if (valid4) {
              if (data.type !== void 0) {
                let data12 = data.type;
                const _errs32 = errors;
                if (typeof data12 !== 'string') {
                  const err21 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/3/properties/type/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (!(data12 === 'unknown')) {
                  const err22 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/3/properties/type/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema58.oneOf[3].properties.type.enum },
                    message: 'must be equal to one of the allowed values',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                var valid4 = _errs32 === errors;
              } else {
                var valid4 = true;
              }
            }
          }
        } else {
          const err23 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      var _valid0 = _errs28 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err24 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err24];
    } else {
      vErrors.push(err24);
    }
    errors++;
    validate125.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate125.errors = vErrors;
  return errors === 0;
}
var schema59 = {
  enum: ['agent', 'userShell', 'unifiedExecStartup', 'unifiedExecInteraction'],
  type: 'string',
};
function validate129(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate129.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'agent' ||
    data === 'userShell' ||
    data === 'unifiedExecStartup' ||
    data === 'unifiedExecInteraction'
  )) {
    validate129.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema59.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate129.errors = vErrors;
  return errors === 0;
}
var schema60 = { enum: ['inProgress', 'completed', 'failed', 'declined'], type: 'string' };
function validate131(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate131.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'inProgress' ||
    data === 'completed' ||
    data === 'failed' ||
    data === 'declined'
  )) {
    validate131.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema60.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate131.errors = vErrors;
  return errors === 0;
}
var schema62 = {
  oneOf: [
    {
      properties: { type: { enum: ['add'], title: 'AddPatchChangeKindType', type: 'string' } },
      required: ['type'],
      title: 'AddPatchChangeKind',
      type: 'object',
    },
    {
      properties: {
        type: { enum: ['delete'], title: 'DeletePatchChangeKindType', type: 'string' },
      },
      required: ['type'],
      title: 'DeletePatchChangeKind',
      type: 'object',
    },
    {
      properties: {
        move_path: { type: ['string', 'null'] },
        type: { enum: ['update'], title: 'UpdatePatchChangeKindType', type: 'string' },
      },
      required: ['type'],
      title: 'UpdatePatchChangeKind',
      type: 'object',
    },
  ],
};
function validate134(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = 'type')) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== 'string') {
            const err1 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/0/properties/type/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          if (!(data0 === 'add')) {
            const err2 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/0/properties/type/enum',
              keyword: 'enum',
              params: { allowedValues: schema62.oneOf[0].properties.type.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
      }
    } else {
      const err3 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (errors === _errs5) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = 'type')) {
        const err4 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data1 = data.type;
          if (typeof data1 !== 'string') {
            const err5 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/1/properties/type/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data1 === 'delete')) {
            const err6 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/1/properties/type/enum',
              keyword: 'enum',
              params: { allowedValues: schema62.oneOf[1].properties.type.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      }
    } else {
      const err7 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs9 = errors;
    if (errors === _errs9) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.type === void 0 && (missing2 = 'type')) {
          const err8 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          if (data.move_path !== void 0) {
            let data2 = data.move_path;
            const _errs11 = errors;
            if (typeof data2 !== 'string' && data2 !== null) {
              const err9 = {
                instancePath: instancePath + '/move_path',
                schemaPath: '#/oneOf/2/properties/move_path/type',
                keyword: 'type',
                params: { type: schema62.oneOf[2].properties.move_path.type },
                message: 'must be string,null',
              };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            var valid3 = _errs11 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data3 = data.type;
              const _errs13 = errors;
              if (typeof data3 !== 'string') {
                const err10 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              if (!(data3 === 'update')) {
                const err11 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema62.oneOf[2].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              var valid3 = _errs13 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      } else {
        const err12 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    var _valid0 = _errs9 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err13 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err13];
    } else {
      vErrors.push(err13);
    }
    errors++;
    validate134.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate134.errors = vErrors;
  return errors === 0;
}
function validate133(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.diff === void 0 && (missing0 = 'diff')) ||
        (data.kind === void 0 && (missing0 = 'kind')) ||
        (data.path === void 0 && (missing0 = 'path'))
      ) {
        validate133.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.diff !== void 0) {
          const _errs1 = errors;
          if (typeof data.diff !== 'string') {
            validate133.errors = [
              {
                instancePath: instancePath + '/diff',
                schemaPath: '#/properties/diff/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.kind !== void 0) {
            const _errs3 = errors;
            if (
              !validate134(data.kind, {
                instancePath: instancePath + '/kind',
                parentData: data,
                parentDataProperty: 'kind',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate134.errors : vErrors.concat(validate134.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.path !== void 0) {
              const _errs4 = errors;
              if (typeof data.path !== 'string') {
                validate133.errors = [
                  {
                    instancePath: instancePath + '/path',
                    schemaPath: '#/properties/path/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate133.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate133.errors = vErrors;
  return errors === 0;
}
var schema63 = { enum: ['inProgress', 'completed', 'failed', 'declined'], type: 'string' };
function validate137(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate137.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'inProgress' ||
    data === 'completed' ||
    data === 'failed' ||
    data === 'declined'
  )) {
    validate137.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema63.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate137.errors = vErrors;
  return errors === 0;
}
var schema64 = {
  properties: {
    actionName: { type: ['string', 'null'] },
    appName: { type: ['string', 'null'] },
    connectorId: { type: 'string' },
    linkId: { type: ['string', 'null'] },
    resourceUri: { type: ['string', 'null'] },
  },
  required: ['connectorId'],
  type: 'object',
};
function validate139(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.connectorId === void 0 && (missing0 = 'connectorId')) {
        validate139.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.actionName !== void 0) {
          let data0 = data.actionName;
          const _errs1 = errors;
          if (typeof data0 !== 'string' && data0 !== null) {
            validate139.errors = [
              {
                instancePath: instancePath + '/actionName',
                schemaPath: '#/properties/actionName/type',
                keyword: 'type',
                params: { type: schema64.properties.actionName.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.appName !== void 0) {
            let data1 = data.appName;
            const _errs3 = errors;
            if (typeof data1 !== 'string' && data1 !== null) {
              validate139.errors = [
                {
                  instancePath: instancePath + '/appName',
                  schemaPath: '#/properties/appName/type',
                  keyword: 'type',
                  params: { type: schema64.properties.appName.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.connectorId !== void 0) {
              const _errs5 = errors;
              if (typeof data.connectorId !== 'string') {
                validate139.errors = [
                  {
                    instancePath: instancePath + '/connectorId',
                    schemaPath: '#/properties/connectorId/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.linkId !== void 0) {
                let data3 = data.linkId;
                const _errs7 = errors;
                if (typeof data3 !== 'string' && data3 !== null) {
                  validate139.errors = [
                    {
                      instancePath: instancePath + '/linkId',
                      schemaPath: '#/properties/linkId/type',
                      keyword: 'type',
                      params: { type: schema64.properties.linkId.type },
                      message: 'must be string,null',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.resourceUri !== void 0) {
                  let data4 = data.resourceUri;
                  const _errs9 = errors;
                  if (typeof data4 !== 'string' && data4 !== null) {
                    validate139.errors = [
                      {
                        instancePath: instancePath + '/resourceUri',
                        schemaPath: '#/properties/resourceUri/type',
                        keyword: 'type',
                        params: { type: schema64.properties.resourceUri.type },
                        message: 'must be string,null',
                      },
                    ];
                    return false;
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
              }
            }
          }
        }
      }
    } else {
      validate139.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate139.errors = vErrors;
  return errors === 0;
}
function validate141(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = 'message')) {
        validate141.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.message !== void 0) {
          if (typeof data.message !== 'string') {
            validate141.errors = [
              {
                instancePath: instancePath + '/message',
                schemaPath: '#/properties/message/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
        }
      }
    } else {
      validate141.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate141.errors = vErrors;
  return errors === 0;
}
var schema67 = { enum: ['inline', 'fullscreen'], type: 'string' };
function validate144(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate144.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'inline' || data === 'fullscreen')) {
    validate144.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema67.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate144.errors = vErrors;
  return errors === 0;
}
function validate143(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.preferredModelDisplayMode === void 0 && (missing0 = 'preferredModelDisplayMode')) ||
        (data.resourceUri === void 0 && (missing0 = 'resourceUri'))
      ) {
        validate143.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.preferredModelDisplayMode !== void 0) {
          const _errs1 = errors;
          if (
            !validate144(data.preferredModelDisplayMode, {
              instancePath: instancePath + '/preferredModelDisplayMode',
              parentData: data,
              parentDataProperty: 'preferredModelDisplayMode',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate144.errors : vErrors.concat(validate144.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.resourceUri !== void 0) {
            const _errs2 = errors;
            if (typeof data.resourceUri !== 'string') {
              validate143.errors = [
                {
                  instancePath: instancePath + '/resourceUri',
                  schemaPath: '#/properties/resourceUri/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate143.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate143.errors = vErrors;
  return errors === 0;
}
function validate147(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.content === void 0 && (missing0 = 'content')) {
        validate147.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.content !== void 0) {
          const _errs1 = errors;
          if (errors === _errs1) {
            if (!Array.isArray(data.content)) {
              validate147.errors = [
                {
                  instancePath: instancePath + '/content',
                  schemaPath: '#/properties/content/type',
                  keyword: 'type',
                  params: { type: 'array' },
                  message: 'must be array',
                },
              ];
              return false;
            }
          }
        }
      }
    } else {
      validate147.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate147.errors = vErrors;
  return errors === 0;
}
var schema69 = { enum: ['inProgress', 'completed', 'failed'], type: 'string' };
function validate149(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate149.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'inProgress' || data === 'completed' || data === 'failed')) {
    validate149.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema69.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate149.errors = vErrors;
  return errors === 0;
}
var schema70 = {
  oneOf: [
    {
      properties: {
        text: { type: 'string' },
        type: {
          enum: ['inputText'],
          title: 'InputTextDynamicToolCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['text', 'type'],
      title: 'InputTextDynamicToolCallOutputContentItem',
      type: 'object',
    },
    {
      properties: {
        imageUrl: { type: 'string' },
        type: {
          enum: ['inputImage'],
          title: 'InputImageDynamicToolCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['imageUrl', 'type'],
      title: 'InputImageDynamicToolCallOutputContentItem',
      type: 'object',
    },
    {
      properties: {
        audioUrl: { type: 'string' },
        type: {
          enum: ['inputAudio'],
          title: 'InputAudioDynamicToolCallOutputContentItemType',
          type: 'string',
        },
      },
      required: ['audioUrl', 'type'],
      title: 'InputAudioDynamicToolCallOutputContentItem',
      type: 'object',
    },
  ],
};
function validate151(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.text === void 0 && (missing0 = 'text')) ||
        (data.type === void 0 && (missing0 = 'type'))
      ) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.text !== void 0) {
          const _errs3 = errors;
          if (typeof data.text !== 'string') {
            const err1 = {
              instancePath: instancePath + '/text',
              schemaPath: '#/oneOf/0/properties/text/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.type !== void 0) {
            let data1 = data.type;
            const _errs5 = errors;
            if (typeof data1 !== 'string') {
              const err2 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/0/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            if (!(data1 === 'inputText')) {
              const err3 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/0/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema70.oneOf[0].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      const err4 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs7 = errors;
  if (errors === _errs7) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (
        (data.imageUrl === void 0 && (missing1 = 'imageUrl')) ||
        (data.type === void 0 && (missing1 = 'type'))
      ) {
        const err5 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      } else {
        if (data.imageUrl !== void 0) {
          const _errs9 = errors;
          if (typeof data.imageUrl !== 'string') {
            const err6 = {
              instancePath: instancePath + '/imageUrl',
              schemaPath: '#/oneOf/1/properties/imageUrl/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          var valid2 = _errs9 === errors;
        } else {
          var valid2 = true;
        }
        if (valid2) {
          if (data.type !== void 0) {
            let data3 = data.type;
            const _errs11 = errors;
            if (typeof data3 !== 'string') {
              const err7 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (!(data3 === 'inputImage')) {
              const err8 = {
                instancePath: instancePath + '/type',
                schemaPath: '#/oneOf/1/properties/type/enum',
                keyword: 'enum',
                params: { allowedValues: schema70.oneOf[1].properties.type.enum },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            var valid2 = _errs11 === errors;
          } else {
            var valid2 = true;
          }
        }
      }
    } else {
      const err9 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
  }
  var _valid0 = _errs7 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs13 = errors;
    if (errors === _errs13) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (
          (data.audioUrl === void 0 && (missing2 = 'audioUrl')) ||
          (data.type === void 0 && (missing2 = 'type'))
        ) {
          const err10 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        } else {
          if (data.audioUrl !== void 0) {
            const _errs15 = errors;
            if (typeof data.audioUrl !== 'string') {
              const err11 = {
                instancePath: instancePath + '/audioUrl',
                schemaPath: '#/oneOf/2/properties/audioUrl/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            var valid3 = _errs15 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data5 = data.type;
              const _errs17 = errors;
              if (typeof data5 !== 'string') {
                const err12 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              if (!(data5 === 'inputAudio')) {
                const err13 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema70.oneOf[2].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              var valid3 = _errs17 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      } else {
        const err14 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    var _valid0 = _errs13 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err15 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
    validate151.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate151.errors = vErrors;
  return errors === 0;
}
var schema71 = { enum: ['inProgress', 'completed', 'failed'], type: 'string' };
function validate153(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate153.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'inProgress' || data === 'completed' || data === 'failed')) {
    validate153.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema71.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate153.errors = vErrors;
  return errors === 0;
}
var schema72 = {
  properties: {
    message: { type: ['string', 'null'] },
    status: { $ref: '#/definitions/v2/CollabAgentStatus' },
  },
  required: ['status'],
  type: 'object',
};
var schema73 = {
  enum: ['pendingInit', 'running', 'interrupted', 'completed', 'errored', 'shutdown', 'notFound'],
  type: 'string',
};
function validate156(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate156.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'pendingInit' ||
    data === 'running' ||
    data === 'interrupted' ||
    data === 'completed' ||
    data === 'errored' ||
    data === 'shutdown' ||
    data === 'notFound'
  )) {
    validate156.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema73.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate156.errors = vErrors;
  return errors === 0;
}
function validate155(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = 'status')) {
        validate155.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.message !== void 0) {
          let data0 = data.message;
          const _errs1 = errors;
          if (typeof data0 !== 'string' && data0 !== null) {
            validate155.errors = [
              {
                instancePath: instancePath + '/message',
                schemaPath: '#/properties/message/type',
                keyword: 'type',
                params: { type: schema72.properties.message.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.status !== void 0) {
            const _errs3 = errors;
            if (
              !validate156(data.status, {
                instancePath: instancePath + '/status',
                parentData: data,
                parentDataProperty: 'status',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate156.errors : vErrors.concat(validate156.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate155.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate155.errors = vErrors;
  return errors === 0;
}
var schema74 = { enum: ['inProgress', 'completed', 'failed', 'interrupted'], type: 'string' };
function validate160(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate160.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'inProgress' ||
    data === 'completed' ||
    data === 'failed' ||
    data === 'interrupted'
  )) {
    validate160.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema74.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate160.errors = vErrors;
  return errors === 0;
}
var schema75 = {
  enum: [
    'spawnAgent',
    'sendInput',
    'resumeAgent',
    'wait',
    'closeAgent',
    'sendMessage',
    'followupTask',
    'interruptAgent',
    'listAgents',
  ],
  type: 'string',
};
function validate162(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate162.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'spawnAgent' ||
    data === 'sendInput' ||
    data === 'resumeAgent' ||
    data === 'wait' ||
    data === 'closeAgent' ||
    data === 'sendMessage' ||
    data === 'followupTask' ||
    data === 'interruptAgent' ||
    data === 'listAgents'
  )) {
    validate162.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema75.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate162.errors = vErrors;
  return errors === 0;
}
var schema76 = { enum: ['started', 'interacted', 'interrupted', 'completed'], type: 'string' };
function validate164(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate164.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'started' ||
    data === 'interacted' ||
    data === 'interrupted' ||
    data === 'completed'
  )) {
    validate164.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema76.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate164.errors = vErrors;
  return errors === 0;
}
var schema77 = {
  oneOf: [
    {
      properties: {
        queries: { items: { type: 'string' }, type: ['array', 'null'] },
        query: { type: ['string', 'null'] },
        type: { enum: ['search'], title: 'SearchWebSearchActionType', type: 'string' },
      },
      required: ['type'],
      title: 'SearchWebSearchAction',
      type: 'object',
    },
    {
      properties: {
        type: { enum: ['openPage'], title: 'OpenPageWebSearchActionType', type: 'string' },
        url: { type: ['string', 'null'] },
      },
      required: ['type'],
      title: 'OpenPageWebSearchAction',
      type: 'object',
    },
    {
      properties: {
        pattern: { type: ['string', 'null'] },
        type: { enum: ['findInPage'], title: 'FindInPageWebSearchActionType', type: 'string' },
        url: { type: ['string', 'null'] },
      },
      required: ['type'],
      title: 'FindInPageWebSearchAction',
      type: 'object',
    },
    {
      properties: { type: { enum: ['other'], title: 'OtherWebSearchActionType', type: 'string' } },
      required: ['type'],
      title: 'OtherWebSearchAction',
      type: 'object',
    },
  ],
};
function validate167(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = 'type')) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.queries !== void 0) {
          let data0 = data.queries;
          const _errs3 = errors;
          if (!Array.isArray(data0) && data0 !== null) {
            const err1 = {
              instancePath: instancePath + '/queries',
              schemaPath: '#/oneOf/0/properties/queries/type',
              keyword: 'type',
              params: { type: schema77.oneOf[0].properties.queries.type },
              message: 'must be array,null',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          if (errors === _errs3) {
            if (Array.isArray(data0)) {
              var valid2 = true;
              const len0 = data0.length;
              for (let i0 = 0; i0 < len0; i0++) {
                const _errs5 = errors;
                if (typeof data0[i0] !== 'string') {
                  const err2 = {
                    instancePath: instancePath + '/queries/' + i0,
                    schemaPath: '#/oneOf/0/properties/queries/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err2];
                  } else {
                    vErrors.push(err2);
                  }
                  errors++;
                }
                var valid2 = _errs5 === errors;
                if (!valid2) {
                  break;
                }
              }
            }
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.query !== void 0) {
            let data2 = data.query;
            const _errs7 = errors;
            if (typeof data2 !== 'string' && data2 !== null) {
              const err3 = {
                instancePath: instancePath + '/query',
                schemaPath: '#/oneOf/0/properties/query/type',
                keyword: 'type',
                params: { type: schema77.oneOf[0].properties.query.type },
                message: 'must be string,null',
              };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var valid1 = _errs7 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.type !== void 0) {
              let data3 = data.type;
              const _errs9 = errors;
              if (typeof data3 !== 'string') {
                const err4 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/0/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              if (!(data3 === 'search')) {
                const err5 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/0/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema77.oneOf[0].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err5];
                } else {
                  vErrors.push(err5);
                }
                errors++;
              }
              var valid1 = _errs9 === errors;
            } else {
              var valid1 = true;
            }
          }
        }
      }
    } else {
      const err6 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs11 = errors;
  if (errors === _errs11) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = 'type')) {
        const err7 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data4 = data.type;
          const _errs13 = errors;
          if (typeof data4 !== 'string') {
            const err8 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/1/properties/type/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data4 === 'openPage')) {
            const err9 = {
              instancePath: instancePath + '/type',
              schemaPath: '#/oneOf/1/properties/type/enum',
              keyword: 'enum',
              params: { allowedValues: schema77.oneOf[1].properties.type.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          var valid3 = _errs13 === errors;
        } else {
          var valid3 = true;
        }
        if (valid3) {
          if (data.url !== void 0) {
            let data5 = data.url;
            const _errs15 = errors;
            if (typeof data5 !== 'string' && data5 !== null) {
              const err10 = {
                instancePath: instancePath + '/url',
                schemaPath: '#/oneOf/1/properties/url/type',
                keyword: 'type',
                params: { type: schema77.oneOf[1].properties.url.type },
                message: 'must be string,null',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            var valid3 = _errs15 === errors;
          } else {
            var valid3 = true;
          }
        }
      }
    } else {
      const err11 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
  }
  var _valid0 = _errs11 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs17 = errors;
    if (errors === _errs17) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (data.type === void 0 && (missing2 = 'type')) {
          const err12 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        } else {
          if (data.pattern !== void 0) {
            let data6 = data.pattern;
            const _errs19 = errors;
            if (typeof data6 !== 'string' && data6 !== null) {
              const err13 = {
                instancePath: instancePath + '/pattern',
                schemaPath: '#/oneOf/2/properties/pattern/type',
                keyword: 'type',
                params: { type: schema77.oneOf[2].properties.pattern.type },
                message: 'must be string,null',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            var valid4 = _errs19 === errors;
          } else {
            var valid4 = true;
          }
          if (valid4) {
            if (data.type !== void 0) {
              let data7 = data.type;
              const _errs21 = errors;
              if (typeof data7 !== 'string') {
                const err14 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              if (!(data7 === 'findInPage')) {
                const err15 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/2/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema77.oneOf[2].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              var valid4 = _errs21 === errors;
            } else {
              var valid4 = true;
            }
            if (valid4) {
              if (data.url !== void 0) {
                let data8 = data.url;
                const _errs23 = errors;
                if (typeof data8 !== 'string' && data8 !== null) {
                  const err16 = {
                    instancePath: instancePath + '/url',
                    schemaPath: '#/oneOf/2/properties/url/type',
                    keyword: 'type',
                    params: { type: schema77.oneOf[2].properties.url.type },
                    message: 'must be string,null',
                  };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                var valid4 = _errs23 === errors;
              } else {
                var valid4 = true;
              }
            }
          }
        }
      } else {
        const err17 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    var _valid0 = _errs17 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs25 = errors;
      if (errors === _errs25) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing3;
          if (data.type === void 0 && (missing3 = 'type')) {
            const err18 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing3 },
              message: "must have required property '" + missing3 + "'",
            };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          } else {
            if (data.type !== void 0) {
              let data9 = data.type;
              if (typeof data9 !== 'string') {
                const err19 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/3/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if (!(data9 === 'other')) {
                const err20 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/3/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema77.oneOf[3].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
          }
        } else {
          const err21 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      var _valid0 = _errs25 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err22 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
    validate167.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate167.errors = vErrors;
  return errors === 0;
}
var schema78 = {
  oneOf: [
    {
      properties: {
        limitId: { type: 'string' },
        resetsAt: { format: 'int64', type: ['integer', 'null'] },
        type: {
          enum: ['usageLimitExceeded'],
          title: 'UsageLimitExceededImageGenerationFailureType',
          type: 'string',
        },
      },
      required: ['limitId', 'type'],
      title: 'UsageLimitExceededImageGenerationFailure',
      type: 'object',
    },
  ],
};
function validate170(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.limitId === void 0 && (missing0 = 'limitId')) ||
        (data.type === void 0 && (missing0 = 'type'))
      ) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.limitId !== void 0) {
          const _errs3 = errors;
          if (typeof data.limitId !== 'string') {
            const err1 = {
              instancePath: instancePath + '/limitId',
              schemaPath: '#/oneOf/0/properties/limitId/type',
              keyword: 'type',
              params: { type: 'string' },
              message: 'must be string',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.resetsAt !== void 0) {
            let data1 = data.resetsAt;
            const _errs5 = errors;
            if (!(typeof data1 == 'number' && !(data1 % 1) && !isNaN(data1)) && data1 !== null) {
              const err2 = {
                instancePath: instancePath + '/resetsAt',
                schemaPath: '#/oneOf/0/properties/resetsAt/type',
                keyword: 'type',
                params: { type: schema78.oneOf[0].properties.resetsAt.type },
                message: 'must be integer,null',
              };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.type !== void 0) {
              let data2 = data.type;
              const _errs7 = errors;
              if (typeof data2 !== 'string') {
                const err3 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/0/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              if (!(data2 === 'usageLimitExceeded')) {
                const err4 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/0/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema78.oneOf[0].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var valid1 = _errs7 === errors;
            } else {
              var valid1 = true;
            }
          }
        }
      }
    } else {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  if (!valid0) {
    const err6 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
    validate170.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate170.errors = vErrors;
  return errors === 0;
}
function validate98(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.content === void 0 && (missing0 = 'content')) ||
        (data.id === void 0 && (missing0 = 'id')) ||
        (data.type === void 0 && (missing0 = 'type'))
      ) {
        const err0 = {
          instancePath,
          schemaPath: '#/oneOf/0/required',
          keyword: 'required',
          params: { missingProperty: missing0 },
          message: "must have required property '" + missing0 + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.clientId !== void 0) {
          let data0 = data.clientId;
          const _errs3 = errors;
          if (typeof data0 !== 'string' && data0 !== null) {
            const err1 = {
              instancePath: instancePath + '/clientId',
              schemaPath: '#/oneOf/0/properties/clientId/type',
              keyword: 'type',
              params: { type: schema45.oneOf[0].properties.clientId.type },
              message: 'must be string,null',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.content !== void 0) {
            let data1 = data.content;
            const _errs5 = errors;
            if (errors === _errs5) {
              if (Array.isArray(data1)) {
                var valid2 = true;
                const len0 = data1.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  const _errs7 = errors;
                  if (
                    !validate99(data1[i0], {
                      instancePath: instancePath + '/content/' + i0,
                      parentData: data1,
                      parentDataProperty: i0,
                      rootData,
                    })
                  ) {
                    vErrors =
                      vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
                    errors = vErrors.length;
                  }
                  var valid2 = _errs7 === errors;
                  if (!valid2) {
                    break;
                  }
                }
              } else {
                const err2 = {
                  instancePath: instancePath + '/content',
                  schemaPath: '#/oneOf/0/properties/content/type',
                  keyword: 'type',
                  params: { type: 'array' },
                  message: 'must be array',
                };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.id !== void 0) {
              const _errs8 = errors;
              if (typeof data.id !== 'string') {
                const err3 = {
                  instancePath: instancePath + '/id',
                  schemaPath: '#/oneOf/0/properties/id/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              var valid1 = _errs8 === errors;
            } else {
              var valid1 = true;
            }
            if (valid1) {
              if (data.type !== void 0) {
                let data4 = data.type;
                const _errs10 = errors;
                if (typeof data4 !== 'string') {
                  const err4 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/0/properties/type/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (!(data4 === 'userMessage')) {
                  const err5 = {
                    instancePath: instancePath + '/type',
                    schemaPath: '#/oneOf/0/properties/type/enum',
                    keyword: 'enum',
                    params: { allowedValues: schema45.oneOf[0].properties.type.enum },
                    message: 'must be equal to one of the allowed values',
                  };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var valid1 = _errs10 === errors;
              } else {
                var valid1 = true;
              }
            }
          }
        }
      }
    } else {
      const err6 = {
        instancePath,
        schemaPath: '#/oneOf/0/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs12 = errors;
  if (errors === _errs12) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing1;
      if (
        (data.fragments === void 0 && (missing1 = 'fragments')) ||
        (data.id === void 0 && (missing1 = 'id')) ||
        (data.type === void 0 && (missing1 = 'type'))
      ) {
        const err7 = {
          instancePath,
          schemaPath: '#/oneOf/1/required',
          keyword: 'required',
          params: { missingProperty: missing1 },
          message: "must have required property '" + missing1 + "'",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      } else {
        if (data.fragments !== void 0) {
          let data5 = data.fragments;
          const _errs14 = errors;
          if (errors === _errs14) {
            if (Array.isArray(data5)) {
              var valid4 = true;
              const len1 = data5.length;
              for (let i1 = 0; i1 < len1; i1++) {
                const _errs16 = errors;
                if (
                  !validate108(data5[i1], {
                    instancePath: instancePath + '/fragments/' + i1,
                    parentData: data5,
                    parentDataProperty: i1,
                    rootData,
                  })
                ) {
                  vErrors =
                    vErrors === null ? validate108.errors : vErrors.concat(validate108.errors);
                  errors = vErrors.length;
                }
                var valid4 = _errs16 === errors;
                if (!valid4) {
                  break;
                }
              }
            } else {
              const err8 = {
                instancePath: instancePath + '/fragments',
                schemaPath: '#/oneOf/1/properties/fragments/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
          var valid3 = _errs14 === errors;
        } else {
          var valid3 = true;
        }
        if (valid3) {
          if (data.id !== void 0) {
            const _errs17 = errors;
            if (typeof data.id !== 'string') {
              const err9 = {
                instancePath: instancePath + '/id',
                schemaPath: '#/oneOf/1/properties/id/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            var valid3 = _errs17 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data8 = data.type;
              const _errs19 = errors;
              if (typeof data8 !== 'string') {
                const err10 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/1/properties/type/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              if (!(data8 === 'hookPrompt')) {
                const err11 = {
                  instancePath: instancePath + '/type',
                  schemaPath: '#/oneOf/1/properties/type/enum',
                  keyword: 'enum',
                  params: { allowedValues: schema45.oneOf[1].properties.type.enum },
                  message: 'must be equal to one of the allowed values',
                };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              var valid3 = _errs19 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      }
    } else {
      const err12 = {
        instancePath,
        schemaPath: '#/oneOf/1/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
  }
  var _valid0 = _errs12 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs21 = errors;
    if (errors === _errs21) {
      if (data && typeof data == 'object' && !Array.isArray(data)) {
        let missing2;
        if (
          (data.id === void 0 && (missing2 = 'id')) ||
          (data.text === void 0 && (missing2 = 'text')) ||
          (data.type === void 0 && (missing2 = 'type'))
        ) {
          const err13 = {
            instancePath,
            schemaPath: '#/oneOf/2/required',
            keyword: 'required',
            params: { missingProperty: missing2 },
            message: "must have required property '" + missing2 + "'",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        } else {
          if (data.delivery !== void 0) {
            let data9 = data.delivery;
            const _errs23 = errors;
            const _errs24 = errors;
            let valid6 = false;
            const _errs25 = errors;
            if (
              !validate110(data9, {
                instancePath: instancePath + '/delivery',
                parentData: data,
                parentDataProperty: 'delivery',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
              errors = vErrors.length;
            }
            var _valid1 = _errs25 === errors;
            valid6 = valid6 || _valid1;
            if (!valid6) {
              const _errs26 = errors;
              if (data9 !== null) {
                const err14 = {
                  instancePath: instancePath + '/delivery',
                  schemaPath: '#/oneOf/2/properties/delivery/anyOf/1/type',
                  keyword: 'type',
                  params: { type: 'null' },
                  message: 'must be null',
                };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              var _valid1 = _errs26 === errors;
              valid6 = valid6 || _valid1;
            }
            if (!valid6) {
              const err15 = {
                instancePath: instancePath + '/delivery',
                schemaPath: '#/oneOf/2/properties/delivery/anyOf',
                keyword: 'anyOf',
                params: {},
                message: 'must match a schema in anyOf',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            } else {
              errors = _errs24;
              if (vErrors !== null) {
                if (_errs24) {
                  vErrors.length = _errs24;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid5 = _errs23 === errors;
          } else {
            var valid5 = true;
          }
          if (valid5) {
            if (data.id !== void 0) {
              const _errs28 = errors;
              if (typeof data.id !== 'string') {
                const err16 = {
                  instancePath: instancePath + '/id',
                  schemaPath: '#/oneOf/2/properties/id/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              var valid5 = _errs28 === errors;
            } else {
              var valid5 = true;
            }
            if (valid5) {
              if (data.memoryCitation !== void 0) {
                let data11 = data.memoryCitation;
                const _errs30 = errors;
                const _errs31 = errors;
                let valid7 = false;
                const _errs32 = errors;
                if (
                  !validate112(data11, {
                    instancePath: instancePath + '/memoryCitation',
                    parentData: data,
                    parentDataProperty: 'memoryCitation',
                    rootData,
                  })
                ) {
                  vErrors =
                    vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
                  errors = vErrors.length;
                }
                var _valid2 = _errs32 === errors;
                valid7 = valid7 || _valid2;
                if (!valid7) {
                  const _errs33 = errors;
                  if (data11 !== null) {
                    const err17 = {
                      instancePath: instancePath + '/memoryCitation',
                      schemaPath: '#/oneOf/2/properties/memoryCitation/anyOf/1/type',
                      keyword: 'type',
                      params: { type: 'null' },
                      message: 'must be null',
                    };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  var _valid2 = _errs33 === errors;
                  valid7 = valid7 || _valid2;
                }
                if (!valid7) {
                  const err18 = {
                    instancePath: instancePath + '/memoryCitation',
                    schemaPath: '#/oneOf/2/properties/memoryCitation/anyOf',
                    keyword: 'anyOf',
                    params: {},
                    message: 'must match a schema in anyOf',
                  };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                } else {
                  errors = _errs31;
                  if (vErrors !== null) {
                    if (_errs31) {
                      vErrors.length = _errs31;
                    } else {
                      vErrors = null;
                    }
                  }
                }
                var valid5 = _errs30 === errors;
              } else {
                var valid5 = true;
              }
              if (valid5) {
                if (data.phase !== void 0) {
                  let data12 = data.phase;
                  const _errs35 = errors;
                  const _errs36 = errors;
                  let valid8 = false;
                  const _errs37 = errors;
                  if (
                    !validate116(data12, {
                      instancePath: instancePath + '/phase',
                      parentData: data,
                      parentDataProperty: 'phase',
                      rootData,
                    })
                  ) {
                    vErrors =
                      vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
                    errors = vErrors.length;
                  }
                  var _valid3 = _errs37 === errors;
                  valid8 = valid8 || _valid3;
                  if (!valid8) {
                    const _errs38 = errors;
                    if (data12 !== null) {
                      const err19 = {
                        instancePath: instancePath + '/phase',
                        schemaPath: '#/oneOf/2/properties/phase/anyOf/1/type',
                        keyword: 'type',
                        params: { type: 'null' },
                        message: 'must be null',
                      };
                      if (vErrors === null) {
                        vErrors = [err19];
                      } else {
                        vErrors.push(err19);
                      }
                      errors++;
                    }
                    var _valid3 = _errs38 === errors;
                    valid8 = valid8 || _valid3;
                  }
                  if (!valid8) {
                    const err20 = {
                      instancePath: instancePath + '/phase',
                      schemaPath: '#/oneOf/2/properties/phase/anyOf',
                      keyword: 'anyOf',
                      params: {},
                      message: 'must match a schema in anyOf',
                    };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  } else {
                    errors = _errs36;
                    if (vErrors !== null) {
                      if (_errs36) {
                        vErrors.length = _errs36;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                  var valid5 = _errs35 === errors;
                } else {
                  var valid5 = true;
                }
                if (valid5) {
                  if (data.questions !== void 0) {
                    let data13 = data.questions;
                    const _errs40 = errors;
                    if (!Array.isArray(data13) && data13 !== null) {
                      const err21 = {
                        instancePath: instancePath + '/questions',
                        schemaPath: '#/oneOf/2/properties/questions/type',
                        keyword: 'type',
                        params: { type: schema45.oneOf[2].properties.questions.type },
                        message: 'must be array,null',
                      };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                    if (errors === _errs40) {
                      if (Array.isArray(data13)) {
                        var valid9 = true;
                        const len2 = data13.length;
                        for (let i2 = 0; i2 < len2; i2++) {
                          const _errs42 = errors;
                          if (
                            !validate118(data13[i2], {
                              instancePath: instancePath + '/questions/' + i2,
                              parentData: data13,
                              parentDataProperty: i2,
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate118.errors
                                : vErrors.concat(validate118.errors);
                            errors = vErrors.length;
                          }
                          var valid9 = _errs42 === errors;
                          if (!valid9) {
                            break;
                          }
                        }
                      }
                    }
                    var valid5 = _errs40 === errors;
                  } else {
                    var valid5 = true;
                  }
                  if (valid5) {
                    if (data.text !== void 0) {
                      const _errs43 = errors;
                      if (typeof data.text !== 'string') {
                        const err22 = {
                          instancePath: instancePath + '/text',
                          schemaPath: '#/oneOf/2/properties/text/type',
                          keyword: 'type',
                          params: { type: 'string' },
                          message: 'must be string',
                        };
                        if (vErrors === null) {
                          vErrors = [err22];
                        } else {
                          vErrors.push(err22);
                        }
                        errors++;
                      }
                      var valid5 = _errs43 === errors;
                    } else {
                      var valid5 = true;
                    }
                    if (valid5) {
                      if (data.type !== void 0) {
                        let data16 = data.type;
                        const _errs45 = errors;
                        if (typeof data16 !== 'string') {
                          const err23 = {
                            instancePath: instancePath + '/type',
                            schemaPath: '#/oneOf/2/properties/type/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          };
                          if (vErrors === null) {
                            vErrors = [err23];
                          } else {
                            vErrors.push(err23);
                          }
                          errors++;
                        }
                        if (!(data16 === 'agentMessage')) {
                          const err24 = {
                            instancePath: instancePath + '/type',
                            schemaPath: '#/oneOf/2/properties/type/enum',
                            keyword: 'enum',
                            params: { allowedValues: schema45.oneOf[2].properties.type.enum },
                            message: 'must be equal to one of the allowed values',
                          };
                          if (vErrors === null) {
                            vErrors = [err24];
                          } else {
                            vErrors.push(err24);
                          }
                          errors++;
                        }
                        var valid5 = _errs45 === errors;
                      } else {
                        var valid5 = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        const err25 = {
          instancePath,
          schemaPath: '#/oneOf/2/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    var _valid0 = _errs21 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs47 = errors;
      if (errors === _errs47) {
        if (data && typeof data == 'object' && !Array.isArray(data)) {
          let missing3;
          if (
            (data.id === void 0 && (missing3 = 'id')) ||
            (data.name === void 0 && (missing3 = 'name')) ||
            (data.output === void 0 && (missing3 = 'output')) ||
            (data.type === void 0 && (missing3 = 'type'))
          ) {
            const err26 = {
              instancePath,
              schemaPath: '#/oneOf/3/required',
              keyword: 'required',
              params: { missingProperty: missing3 },
              message: "must have required property '" + missing3 + "'",
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          } else {
            if (data.id !== void 0) {
              const _errs49 = errors;
              if (typeof data.id !== 'string') {
                const err27 = {
                  instancePath: instancePath + '/id',
                  schemaPath: '#/oneOf/3/properties/id/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              var valid10 = _errs49 === errors;
            } else {
              var valid10 = true;
            }
            if (valid10) {
              if (data.name !== void 0) {
                const _errs51 = errors;
                if (typeof data.name !== 'string') {
                  const err28 = {
                    instancePath: instancePath + '/name',
                    schemaPath: '#/oneOf/3/properties/name/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                var valid10 = _errs51 === errors;
              } else {
                var valid10 = true;
              }
              if (valid10) {
                if (data.namespace !== void 0) {
                  let data19 = data.namespace;
                  const _errs53 = errors;
                  if (typeof data19 !== 'string' && data19 !== null) {
                    const err29 = {
                      instancePath: instancePath + '/namespace',
                      schemaPath: '#/oneOf/3/properties/namespace/type',
                      keyword: 'type',
                      params: { type: schema45.oneOf[3].properties.namespace.type },
                      message: 'must be string,null',
                    };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                  var valid10 = _errs53 === errors;
                } else {
                  var valid10 = true;
                }
                if (valid10) {
                  if (data.output !== void 0) {
                    const _errs55 = errors;
                    if (
                      !validate120(data.output, {
                        instancePath: instancePath + '/output',
                        parentData: data,
                        parentDataProperty: 'output',
                        rootData,
                      })
                    ) {
                      vErrors =
                        vErrors === null ? validate120.errors : vErrors.concat(validate120.errors);
                      errors = vErrors.length;
                    }
                    var valid10 = _errs55 === errors;
                  } else {
                    var valid10 = true;
                  }
                  if (valid10) {
                    if (data.type !== void 0) {
                      let data21 = data.type;
                      const _errs56 = errors;
                      if (typeof data21 !== 'string') {
                        const err30 = {
                          instancePath: instancePath + '/type',
                          schemaPath: '#/oneOf/3/properties/type/type',
                          keyword: 'type',
                          params: { type: 'string' },
                          message: 'must be string',
                        };
                        if (vErrors === null) {
                          vErrors = [err30];
                        } else {
                          vErrors.push(err30);
                        }
                        errors++;
                      }
                      if (!(data21 === 'functionCallOutput')) {
                        const err31 = {
                          instancePath: instancePath + '/type',
                          schemaPath: '#/oneOf/3/properties/type/enum',
                          keyword: 'enum',
                          params: { allowedValues: schema45.oneOf[3].properties.type.enum },
                          message: 'must be equal to one of the allowed values',
                        };
                        if (vErrors === null) {
                          vErrors = [err31];
                        } else {
                          vErrors.push(err31);
                        }
                        errors++;
                      }
                      var valid10 = _errs56 === errors;
                    } else {
                      var valid10 = true;
                    }
                  }
                }
              }
            }
          }
        } else {
          const err32 = {
            instancePath,
            schemaPath: '#/oneOf/3/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      }
      var _valid0 = _errs47 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs58 = errors;
        if (errors === _errs58) {
          if (data && typeof data == 'object' && !Array.isArray(data)) {
            let missing4;
            if (
              (data.id === void 0 && (missing4 = 'id')) ||
              (data.text === void 0 && (missing4 = 'text')) ||
              (data.type === void 0 && (missing4 = 'type'))
            ) {
              const err33 = {
                instancePath,
                schemaPath: '#/oneOf/4/required',
                keyword: 'required',
                params: { missingProperty: missing4 },
                message: "must have required property '" + missing4 + "'",
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            } else {
              if (data.id !== void 0) {
                const _errs60 = errors;
                if (typeof data.id !== 'string') {
                  const err34 = {
                    instancePath: instancePath + '/id',
                    schemaPath: '#/oneOf/4/properties/id/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
                var valid11 = _errs60 === errors;
              } else {
                var valid11 = true;
              }
              if (valid11) {
                if (data.text !== void 0) {
                  const _errs62 = errors;
                  if (typeof data.text !== 'string') {
                    const err35 = {
                      instancePath: instancePath + '/text',
                      schemaPath: '#/oneOf/4/properties/text/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  var valid11 = _errs62 === errors;
                } else {
                  var valid11 = true;
                }
                if (valid11) {
                  if (data.type !== void 0) {
                    let data24 = data.type;
                    const _errs64 = errors;
                    if (typeof data24 !== 'string') {
                      const err36 = {
                        instancePath: instancePath + '/type',
                        schemaPath: '#/oneOf/4/properties/type/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err36];
                      } else {
                        vErrors.push(err36);
                      }
                      errors++;
                    }
                    if (!(data24 === 'plan')) {
                      const err37 = {
                        instancePath: instancePath + '/type',
                        schemaPath: '#/oneOf/4/properties/type/enum',
                        keyword: 'enum',
                        params: { allowedValues: schema45.oneOf[4].properties.type.enum },
                        message: 'must be equal to one of the allowed values',
                      };
                      if (vErrors === null) {
                        vErrors = [err37];
                      } else {
                        vErrors.push(err37);
                      }
                      errors++;
                    }
                    var valid11 = _errs64 === errors;
                  } else {
                    var valid11 = true;
                  }
                }
              }
            }
          } else {
            const err38 = {
              instancePath,
              schemaPath: '#/oneOf/4/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
        var _valid0 = _errs58 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs66 = errors;
          if (errors === _errs66) {
            if (data && typeof data == 'object' && !Array.isArray(data)) {
              let missing5;
              if (
                (data.id === void 0 && (missing5 = 'id')) ||
                (data.type === void 0 && (missing5 = 'type'))
              ) {
                const err39 = {
                  instancePath,
                  schemaPath: '#/oneOf/5/required',
                  keyword: 'required',
                  params: { missingProperty: missing5 },
                  message: "must have required property '" + missing5 + "'",
                };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              } else {
                if (data.content !== void 0) {
                  let data25 = data.content;
                  const _errs68 = errors;
                  if (errors === _errs68) {
                    if (Array.isArray(data25)) {
                      var valid13 = true;
                      const len3 = data25.length;
                      for (let i3 = 0; i3 < len3; i3++) {
                        const _errs70 = errors;
                        if (typeof data25[i3] !== 'string') {
                          const err40 = {
                            instancePath: instancePath + '/content/' + i3,
                            schemaPath: '#/oneOf/5/properties/content/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          };
                          if (vErrors === null) {
                            vErrors = [err40];
                          } else {
                            vErrors.push(err40);
                          }
                          errors++;
                        }
                        var valid13 = _errs70 === errors;
                        if (!valid13) {
                          break;
                        }
                      }
                    } else {
                      const err41 = {
                        instancePath: instancePath + '/content',
                        schemaPath: '#/oneOf/5/properties/content/type',
                        keyword: 'type',
                        params: { type: 'array' },
                        message: 'must be array',
                      };
                      if (vErrors === null) {
                        vErrors = [err41];
                      } else {
                        vErrors.push(err41);
                      }
                      errors++;
                    }
                  }
                  var valid12 = _errs68 === errors;
                } else {
                  var valid12 = true;
                }
                if (valid12) {
                  if (data.id !== void 0) {
                    const _errs72 = errors;
                    if (typeof data.id !== 'string') {
                      const err42 = {
                        instancePath: instancePath + '/id',
                        schemaPath: '#/oneOf/5/properties/id/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err42];
                      } else {
                        vErrors.push(err42);
                      }
                      errors++;
                    }
                    var valid12 = _errs72 === errors;
                  } else {
                    var valid12 = true;
                  }
                  if (valid12) {
                    if (data.summary !== void 0) {
                      let data28 = data.summary;
                      const _errs74 = errors;
                      if (errors === _errs74) {
                        if (Array.isArray(data28)) {
                          var valid14 = true;
                          const len4 = data28.length;
                          for (let i4 = 0; i4 < len4; i4++) {
                            const _errs76 = errors;
                            if (typeof data28[i4] !== 'string') {
                              const err43 = {
                                instancePath: instancePath + '/summary/' + i4,
                                schemaPath: '#/oneOf/5/properties/summary/items/type',
                                keyword: 'type',
                                params: { type: 'string' },
                                message: 'must be string',
                              };
                              if (vErrors === null) {
                                vErrors = [err43];
                              } else {
                                vErrors.push(err43);
                              }
                              errors++;
                            }
                            var valid14 = _errs76 === errors;
                            if (!valid14) {
                              break;
                            }
                          }
                        } else {
                          const err44 = {
                            instancePath: instancePath + '/summary',
                            schemaPath: '#/oneOf/5/properties/summary/type',
                            keyword: 'type',
                            params: { type: 'array' },
                            message: 'must be array',
                          };
                          if (vErrors === null) {
                            vErrors = [err44];
                          } else {
                            vErrors.push(err44);
                          }
                          errors++;
                        }
                      }
                      var valid12 = _errs74 === errors;
                    } else {
                      var valid12 = true;
                    }
                    if (valid12) {
                      if (data.type !== void 0) {
                        let data30 = data.type;
                        const _errs78 = errors;
                        if (typeof data30 !== 'string') {
                          const err45 = {
                            instancePath: instancePath + '/type',
                            schemaPath: '#/oneOf/5/properties/type/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          };
                          if (vErrors === null) {
                            vErrors = [err45];
                          } else {
                            vErrors.push(err45);
                          }
                          errors++;
                        }
                        if (!(data30 === 'reasoning')) {
                          const err46 = {
                            instancePath: instancePath + '/type',
                            schemaPath: '#/oneOf/5/properties/type/enum',
                            keyword: 'enum',
                            params: { allowedValues: schema45.oneOf[5].properties.type.enum },
                            message: 'must be equal to one of the allowed values',
                          };
                          if (vErrors === null) {
                            vErrors = [err46];
                          } else {
                            vErrors.push(err46);
                          }
                          errors++;
                        }
                        var valid12 = _errs78 === errors;
                      } else {
                        var valid12 = true;
                      }
                    }
                  }
                }
              }
            } else {
              const err47 = {
                instancePath,
                schemaPath: '#/oneOf/5/type',
                keyword: 'type',
                params: { type: 'object' },
                message: 'must be object',
              };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
          var _valid0 = _errs66 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs80 = errors;
            if (errors === _errs80) {
              if (data && typeof data == 'object' && !Array.isArray(data)) {
                let missing6;
                if (
                  (data.command === void 0 && (missing6 = 'command')) ||
                  (data.commandActions === void 0 && (missing6 = 'commandActions')) ||
                  (data.cwd === void 0 && (missing6 = 'cwd')) ||
                  (data.id === void 0 && (missing6 = 'id')) ||
                  (data.status === void 0 && (missing6 = 'status')) ||
                  (data.type === void 0 && (missing6 = 'type'))
                ) {
                  const err48 = {
                    instancePath,
                    schemaPath: '#/oneOf/6/required',
                    keyword: 'required',
                    params: { missingProperty: missing6 },
                    message: "must have required property '" + missing6 + "'",
                  };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                } else {
                  if (data.aggregatedOutput !== void 0) {
                    let data31 = data.aggregatedOutput;
                    const _errs82 = errors;
                    if (typeof data31 !== 'string' && data31 !== null) {
                      const err49 = {
                        instancePath: instancePath + '/aggregatedOutput',
                        schemaPath: '#/oneOf/6/properties/aggregatedOutput/type',
                        keyword: 'type',
                        params: { type: schema45.oneOf[6].properties.aggregatedOutput.type },
                        message: 'must be string,null',
                      };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    var valid15 = _errs82 === errors;
                  } else {
                    var valid15 = true;
                  }
                  if (valid15) {
                    if (data.command !== void 0) {
                      const _errs84 = errors;
                      if (typeof data.command !== 'string') {
                        const err50 = {
                          instancePath: instancePath + '/command',
                          schemaPath: '#/oneOf/6/properties/command/type',
                          keyword: 'type',
                          params: { type: 'string' },
                          message: 'must be string',
                        };
                        if (vErrors === null) {
                          vErrors = [err50];
                        } else {
                          vErrors.push(err50);
                        }
                        errors++;
                      }
                      var valid15 = _errs84 === errors;
                    } else {
                      var valid15 = true;
                    }
                    if (valid15) {
                      if (data.commandActions !== void 0) {
                        let data33 = data.commandActions;
                        const _errs86 = errors;
                        if (errors === _errs86) {
                          if (Array.isArray(data33)) {
                            var valid16 = true;
                            const len5 = data33.length;
                            for (let i5 = 0; i5 < len5; i5++) {
                              const _errs88 = errors;
                              if (
                                !validate125(data33[i5], {
                                  instancePath: instancePath + '/commandActions/' + i5,
                                  parentData: data33,
                                  parentDataProperty: i5,
                                  rootData,
                                })
                              ) {
                                vErrors =
                                  vErrors === null
                                    ? validate125.errors
                                    : vErrors.concat(validate125.errors);
                                errors = vErrors.length;
                              }
                              var valid16 = _errs88 === errors;
                              if (!valid16) {
                                break;
                              }
                            }
                          } else {
                            const err51 = {
                              instancePath: instancePath + '/commandActions',
                              schemaPath: '#/oneOf/6/properties/commandActions/type',
                              keyword: 'type',
                              params: { type: 'array' },
                              message: 'must be array',
                            };
                            if (vErrors === null) {
                              vErrors = [err51];
                            } else {
                              vErrors.push(err51);
                            }
                            errors++;
                          }
                        }
                        var valid15 = _errs86 === errors;
                      } else {
                        var valid15 = true;
                      }
                      if (valid15) {
                        if (data.cwd !== void 0) {
                          const _errs89 = errors;
                          if (
                            !validate54(data.cwd, {
                              instancePath: instancePath + '/cwd',
                              parentData: data,
                              parentDataProperty: 'cwd',
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate54.errors
                                : vErrors.concat(validate54.errors);
                            errors = vErrors.length;
                          }
                          var valid15 = _errs89 === errors;
                        } else {
                          var valid15 = true;
                        }
                        if (valid15) {
                          if (data.durationMs !== void 0) {
                            let data36 = data.durationMs;
                            const _errs91 = errors;
                            if (
                              !(typeof data36 == 'number' && !(data36 % 1) && !isNaN(data36)) &&
                              data36 !== null
                            ) {
                              const err52 = {
                                instancePath: instancePath + '/durationMs',
                                schemaPath: '#/oneOf/6/properties/durationMs/type',
                                keyword: 'type',
                                params: { type: schema45.oneOf[6].properties.durationMs.type },
                                message: 'must be integer,null',
                              };
                              if (vErrors === null) {
                                vErrors = [err52];
                              } else {
                                vErrors.push(err52);
                              }
                              errors++;
                            }
                            var valid15 = _errs91 === errors;
                          } else {
                            var valid15 = true;
                          }
                          if (valid15) {
                            if (data.exitCode !== void 0) {
                              let data37 = data.exitCode;
                              const _errs93 = errors;
                              if (
                                !(typeof data37 == 'number' && !(data37 % 1) && !isNaN(data37)) &&
                                data37 !== null
                              ) {
                                const err53 = {
                                  instancePath: instancePath + '/exitCode',
                                  schemaPath: '#/oneOf/6/properties/exitCode/type',
                                  keyword: 'type',
                                  params: { type: schema45.oneOf[6].properties.exitCode.type },
                                  message: 'must be integer,null',
                                };
                                if (vErrors === null) {
                                  vErrors = [err53];
                                } else {
                                  vErrors.push(err53);
                                }
                                errors++;
                              }
                              var valid15 = _errs93 === errors;
                            } else {
                              var valid15 = true;
                            }
                            if (valid15) {
                              if (data.id !== void 0) {
                                const _errs95 = errors;
                                if (typeof data.id !== 'string') {
                                  const err54 = {
                                    instancePath: instancePath + '/id',
                                    schemaPath: '#/oneOf/6/properties/id/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err54];
                                  } else {
                                    vErrors.push(err54);
                                  }
                                  errors++;
                                }
                                var valid15 = _errs95 === errors;
                              } else {
                                var valid15 = true;
                              }
                              if (valid15) {
                                if (data.pluginId !== void 0) {
                                  let data39 = data.pluginId;
                                  const _errs97 = errors;
                                  if (typeof data39 !== 'string' && data39 !== null) {
                                    const err55 = {
                                      instancePath: instancePath + '/pluginId',
                                      schemaPath: '#/oneOf/6/properties/pluginId/type',
                                      keyword: 'type',
                                      params: { type: schema45.oneOf[6].properties.pluginId.type },
                                      message: 'must be string,null',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err55];
                                    } else {
                                      vErrors.push(err55);
                                    }
                                    errors++;
                                  }
                                  var valid15 = _errs97 === errors;
                                } else {
                                  var valid15 = true;
                                }
                                if (valid15) {
                                  if (data.processId !== void 0) {
                                    let data40 = data.processId;
                                    const _errs99 = errors;
                                    if (typeof data40 !== 'string' && data40 !== null) {
                                      const err56 = {
                                        instancePath: instancePath + '/processId',
                                        schemaPath: '#/oneOf/6/properties/processId/type',
                                        keyword: 'type',
                                        params: {
                                          type: schema45.oneOf[6].properties.processId.type,
                                        },
                                        message: 'must be string,null',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err56];
                                      } else {
                                        vErrors.push(err56);
                                      }
                                      errors++;
                                    }
                                    var valid15 = _errs99 === errors;
                                  } else {
                                    var valid15 = true;
                                  }
                                  if (valid15) {
                                    if (data.scriptPath !== void 0) {
                                      let data41 = data.scriptPath;
                                      const _errs101 = errors;
                                      if (typeof data41 !== 'string' && data41 !== null) {
                                        const err57 = {
                                          instancePath: instancePath + '/scriptPath',
                                          schemaPath: '#/oneOf/6/properties/scriptPath/type',
                                          keyword: 'type',
                                          params: {
                                            type: schema45.oneOf[6].properties.scriptPath.type,
                                          },
                                          message: 'must be string,null',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err57];
                                        } else {
                                          vErrors.push(err57);
                                        }
                                        errors++;
                                      }
                                      var valid15 = _errs101 === errors;
                                    } else {
                                      var valid15 = true;
                                    }
                                    if (valid15) {
                                      if (data.source !== void 0) {
                                        const _errs103 = errors;
                                        if (
                                          !validate129(data.source, {
                                            instancePath: instancePath + '/source',
                                            parentData: data,
                                            parentDataProperty: 'source',
                                            rootData,
                                          })
                                        ) {
                                          vErrors =
                                            vErrors === null
                                              ? validate129.errors
                                              : vErrors.concat(validate129.errors);
                                          errors = vErrors.length;
                                        }
                                        var valid15 = _errs103 === errors;
                                      } else {
                                        var valid15 = true;
                                      }
                                      if (valid15) {
                                        if (data.status !== void 0) {
                                          const _errs105 = errors;
                                          if (
                                            !validate131(data.status, {
                                              instancePath: instancePath + '/status',
                                              parentData: data,
                                              parentDataProperty: 'status',
                                              rootData,
                                            })
                                          ) {
                                            vErrors =
                                              vErrors === null
                                                ? validate131.errors
                                                : vErrors.concat(validate131.errors);
                                            errors = vErrors.length;
                                          }
                                          var valid15 = _errs105 === errors;
                                        } else {
                                          var valid15 = true;
                                        }
                                        if (valid15) {
                                          if (data.type !== void 0) {
                                            let data44 = data.type;
                                            const _errs106 = errors;
                                            if (typeof data44 !== 'string') {
                                              const err58 = {
                                                instancePath: instancePath + '/type',
                                                schemaPath: '#/oneOf/6/properties/type/type',
                                                keyword: 'type',
                                                params: { type: 'string' },
                                                message: 'must be string',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err58];
                                              } else {
                                                vErrors.push(err58);
                                              }
                                              errors++;
                                            }
                                            if (!(data44 === 'commandExecution')) {
                                              const err59 = {
                                                instancePath: instancePath + '/type',
                                                schemaPath: '#/oneOf/6/properties/type/enum',
                                                keyword: 'enum',
                                                params: {
                                                  allowedValues:
                                                    schema45.oneOf[6].properties.type.enum,
                                                },
                                                message:
                                                  'must be equal to one of the allowed values',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err59];
                                              } else {
                                                vErrors.push(err59);
                                              }
                                              errors++;
                                            }
                                            var valid15 = _errs106 === errors;
                                          } else {
                                            var valid15 = true;
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                const err60 = {
                  instancePath,
                  schemaPath: '#/oneOf/6/type',
                  keyword: 'type',
                  params: { type: 'object' },
                  message: 'must be object',
                };
                if (vErrors === null) {
                  vErrors = [err60];
                } else {
                  vErrors.push(err60);
                }
                errors++;
              }
            }
            var _valid0 = _errs80 === errors;
            if (_valid0 && valid0) {
              valid0 = false;
              passing0 = [passing0, 6];
            } else {
              if (_valid0) {
                valid0 = true;
                passing0 = 6;
              }
              const _errs108 = errors;
              if (errors === _errs108) {
                if (data && typeof data == 'object' && !Array.isArray(data)) {
                  let missing7;
                  if (
                    (data.changes === void 0 && (missing7 = 'changes')) ||
                    (data.id === void 0 && (missing7 = 'id')) ||
                    (data.status === void 0 && (missing7 = 'status')) ||
                    (data.type === void 0 && (missing7 = 'type'))
                  ) {
                    const err61 = {
                      instancePath,
                      schemaPath: '#/oneOf/7/required',
                      keyword: 'required',
                      params: { missingProperty: missing7 },
                      message: "must have required property '" + missing7 + "'",
                    };
                    if (vErrors === null) {
                      vErrors = [err61];
                    } else {
                      vErrors.push(err61);
                    }
                    errors++;
                  } else {
                    if (data.changes !== void 0) {
                      let data45 = data.changes;
                      const _errs110 = errors;
                      if (errors === _errs110) {
                        if (Array.isArray(data45)) {
                          var valid20 = true;
                          const len6 = data45.length;
                          for (let i6 = 0; i6 < len6; i6++) {
                            const _errs112 = errors;
                            if (
                              !validate133(data45[i6], {
                                instancePath: instancePath + '/changes/' + i6,
                                parentData: data45,
                                parentDataProperty: i6,
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate133.errors
                                  : vErrors.concat(validate133.errors);
                              errors = vErrors.length;
                            }
                            var valid20 = _errs112 === errors;
                            if (!valid20) {
                              break;
                            }
                          }
                        } else {
                          const err62 = {
                            instancePath: instancePath + '/changes',
                            schemaPath: '#/oneOf/7/properties/changes/type',
                            keyword: 'type',
                            params: { type: 'array' },
                            message: 'must be array',
                          };
                          if (vErrors === null) {
                            vErrors = [err62];
                          } else {
                            vErrors.push(err62);
                          }
                          errors++;
                        }
                      }
                      var valid19 = _errs110 === errors;
                    } else {
                      var valid19 = true;
                    }
                    if (valid19) {
                      if (data.id !== void 0) {
                        const _errs113 = errors;
                        if (typeof data.id !== 'string') {
                          const err63 = {
                            instancePath: instancePath + '/id',
                            schemaPath: '#/oneOf/7/properties/id/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          };
                          if (vErrors === null) {
                            vErrors = [err63];
                          } else {
                            vErrors.push(err63);
                          }
                          errors++;
                        }
                        var valid19 = _errs113 === errors;
                      } else {
                        var valid19 = true;
                      }
                      if (valid19) {
                        if (data.status !== void 0) {
                          const _errs115 = errors;
                          if (
                            !validate137(data.status, {
                              instancePath: instancePath + '/status',
                              parentData: data,
                              parentDataProperty: 'status',
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate137.errors
                                : vErrors.concat(validate137.errors);
                            errors = vErrors.length;
                          }
                          var valid19 = _errs115 === errors;
                        } else {
                          var valid19 = true;
                        }
                        if (valid19) {
                          if (data.type !== void 0) {
                            let data49 = data.type;
                            const _errs116 = errors;
                            if (typeof data49 !== 'string') {
                              const err64 = {
                                instancePath: instancePath + '/type',
                                schemaPath: '#/oneOf/7/properties/type/type',
                                keyword: 'type',
                                params: { type: 'string' },
                                message: 'must be string',
                              };
                              if (vErrors === null) {
                                vErrors = [err64];
                              } else {
                                vErrors.push(err64);
                              }
                              errors++;
                            }
                            if (!(data49 === 'fileChange')) {
                              const err65 = {
                                instancePath: instancePath + '/type',
                                schemaPath: '#/oneOf/7/properties/type/enum',
                                keyword: 'enum',
                                params: { allowedValues: schema45.oneOf[7].properties.type.enum },
                                message: 'must be equal to one of the allowed values',
                              };
                              if (vErrors === null) {
                                vErrors = [err65];
                              } else {
                                vErrors.push(err65);
                              }
                              errors++;
                            }
                            var valid19 = _errs116 === errors;
                          } else {
                            var valid19 = true;
                          }
                        }
                      }
                    }
                  }
                } else {
                  const err66 = {
                    instancePath,
                    schemaPath: '#/oneOf/7/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                  };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs108 === errors;
              if (_valid0 && valid0) {
                valid0 = false;
                passing0 = [passing0, 7];
              } else {
                if (_valid0) {
                  valid0 = true;
                  passing0 = 7;
                }
                const _errs118 = errors;
                if (errors === _errs118) {
                  if (data && typeof data == 'object' && !Array.isArray(data)) {
                    let missing8;
                    if (
                      (data.arguments === void 0 && (missing8 = 'arguments')) ||
                      (data.id === void 0 && (missing8 = 'id')) ||
                      (data.server === void 0 && (missing8 = 'server')) ||
                      (data.status === void 0 && (missing8 = 'status')) ||
                      (data.tool === void 0 && (missing8 = 'tool')) ||
                      (data.type === void 0 && (missing8 = 'type'))
                    ) {
                      const err67 = {
                        instancePath,
                        schemaPath: '#/oneOf/8/required',
                        keyword: 'required',
                        params: { missingProperty: missing8 },
                        message: "must have required property '" + missing8 + "'",
                      };
                      if (vErrors === null) {
                        vErrors = [err67];
                      } else {
                        vErrors.push(err67);
                      }
                      errors++;
                    } else {
                      if (data.appContext !== void 0) {
                        let data50 = data.appContext;
                        const _errs120 = errors;
                        const _errs121 = errors;
                        let valid22 = false;
                        const _errs122 = errors;
                        if (
                          !validate139(data50, {
                            instancePath: instancePath + '/appContext',
                            parentData: data,
                            parentDataProperty: 'appContext',
                            rootData,
                          })
                        ) {
                          vErrors =
                            vErrors === null
                              ? validate139.errors
                              : vErrors.concat(validate139.errors);
                          errors = vErrors.length;
                        }
                        var _valid4 = _errs122 === errors;
                        valid22 = valid22 || _valid4;
                        if (!valid22) {
                          const _errs123 = errors;
                          if (data50 !== null) {
                            const err68 = {
                              instancePath: instancePath + '/appContext',
                              schemaPath: '#/oneOf/8/properties/appContext/anyOf/1/type',
                              keyword: 'type',
                              params: { type: 'null' },
                              message: 'must be null',
                            };
                            if (vErrors === null) {
                              vErrors = [err68];
                            } else {
                              vErrors.push(err68);
                            }
                            errors++;
                          }
                          var _valid4 = _errs123 === errors;
                          valid22 = valid22 || _valid4;
                        }
                        if (!valid22) {
                          const err69 = {
                            instancePath: instancePath + '/appContext',
                            schemaPath: '#/oneOf/8/properties/appContext/anyOf',
                            keyword: 'anyOf',
                            params: {},
                            message: 'must match a schema in anyOf',
                          };
                          if (vErrors === null) {
                            vErrors = [err69];
                          } else {
                            vErrors.push(err69);
                          }
                          errors++;
                        } else {
                          errors = _errs121;
                          if (vErrors !== null) {
                            if (_errs121) {
                              vErrors.length = _errs121;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid21 = _errs120 === errors;
                      } else {
                        var valid21 = true;
                      }
                      if (valid21) {
                        if (data.durationMs !== void 0) {
                          let data51 = data.durationMs;
                          const _errs125 = errors;
                          if (
                            !(typeof data51 == 'number' && !(data51 % 1) && !isNaN(data51)) &&
                            data51 !== null
                          ) {
                            const err70 = {
                              instancePath: instancePath + '/durationMs',
                              schemaPath: '#/oneOf/8/properties/durationMs/type',
                              keyword: 'type',
                              params: { type: schema45.oneOf[8].properties.durationMs.type },
                              message: 'must be integer,null',
                            };
                            if (vErrors === null) {
                              vErrors = [err70];
                            } else {
                              vErrors.push(err70);
                            }
                            errors++;
                          }
                          var valid21 = _errs125 === errors;
                        } else {
                          var valid21 = true;
                        }
                        if (valid21) {
                          if (data.error !== void 0) {
                            let data52 = data.error;
                            const _errs127 = errors;
                            const _errs128 = errors;
                            let valid23 = false;
                            const _errs129 = errors;
                            if (
                              !validate141(data52, {
                                instancePath: instancePath + '/error',
                                parentData: data,
                                parentDataProperty: 'error',
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate141.errors
                                  : vErrors.concat(validate141.errors);
                              errors = vErrors.length;
                            }
                            var _valid5 = _errs129 === errors;
                            valid23 = valid23 || _valid5;
                            if (!valid23) {
                              const _errs130 = errors;
                              if (data52 !== null) {
                                const err71 = {
                                  instancePath: instancePath + '/error',
                                  schemaPath: '#/oneOf/8/properties/error/anyOf/1/type',
                                  keyword: 'type',
                                  params: { type: 'null' },
                                  message: 'must be null',
                                };
                                if (vErrors === null) {
                                  vErrors = [err71];
                                } else {
                                  vErrors.push(err71);
                                }
                                errors++;
                              }
                              var _valid5 = _errs130 === errors;
                              valid23 = valid23 || _valid5;
                            }
                            if (!valid23) {
                              const err72 = {
                                instancePath: instancePath + '/error',
                                schemaPath: '#/oneOf/8/properties/error/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                              };
                              if (vErrors === null) {
                                vErrors = [err72];
                              } else {
                                vErrors.push(err72);
                              }
                              errors++;
                            } else {
                              errors = _errs128;
                              if (vErrors !== null) {
                                if (_errs128) {
                                  vErrors.length = _errs128;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid21 = _errs127 === errors;
                          } else {
                            var valid21 = true;
                          }
                          if (valid21) {
                            if (data.id !== void 0) {
                              const _errs132 = errors;
                              if (typeof data.id !== 'string') {
                                const err73 = {
                                  instancePath: instancePath + '/id',
                                  schemaPath: '#/oneOf/8/properties/id/type',
                                  keyword: 'type',
                                  params: { type: 'string' },
                                  message: 'must be string',
                                };
                                if (vErrors === null) {
                                  vErrors = [err73];
                                } else {
                                  vErrors.push(err73);
                                }
                                errors++;
                              }
                              var valid21 = _errs132 === errors;
                            } else {
                              var valid21 = true;
                            }
                            if (valid21) {
                              if (data.mcpAppResourceUri !== void 0) {
                                let data54 = data.mcpAppResourceUri;
                                const _errs134 = errors;
                                if (typeof data54 !== 'string' && data54 !== null) {
                                  const err74 = {
                                    instancePath: instancePath + '/mcpAppResourceUri',
                                    schemaPath: '#/oneOf/8/properties/mcpAppResourceUri/type',
                                    keyword: 'type',
                                    params: {
                                      type: schema45.oneOf[8].properties.mcpAppResourceUri.type,
                                    },
                                    message: 'must be string,null',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err74];
                                  } else {
                                    vErrors.push(err74);
                                  }
                                  errors++;
                                }
                                var valid21 = _errs134 === errors;
                              } else {
                                var valid21 = true;
                              }
                              if (valid21) {
                                if (data.mcpAppUi !== void 0) {
                                  let data55 = data.mcpAppUi;
                                  const _errs136 = errors;
                                  const _errs137 = errors;
                                  let valid24 = false;
                                  const _errs138 = errors;
                                  if (
                                    !validate143(data55, {
                                      instancePath: instancePath + '/mcpAppUi',
                                      parentData: data,
                                      parentDataProperty: 'mcpAppUi',
                                      rootData,
                                    })
                                  ) {
                                    vErrors =
                                      vErrors === null
                                        ? validate143.errors
                                        : vErrors.concat(validate143.errors);
                                    errors = vErrors.length;
                                  }
                                  var _valid6 = _errs138 === errors;
                                  valid24 = valid24 || _valid6;
                                  if (!valid24) {
                                    const _errs139 = errors;
                                    if (data55 !== null) {
                                      const err75 = {
                                        instancePath: instancePath + '/mcpAppUi',
                                        schemaPath: '#/oneOf/8/properties/mcpAppUi/anyOf/1/type',
                                        keyword: 'type',
                                        params: { type: 'null' },
                                        message: 'must be null',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err75];
                                      } else {
                                        vErrors.push(err75);
                                      }
                                      errors++;
                                    }
                                    var _valid6 = _errs139 === errors;
                                    valid24 = valid24 || _valid6;
                                  }
                                  if (!valid24) {
                                    const err76 = {
                                      instancePath: instancePath + '/mcpAppUi',
                                      schemaPath: '#/oneOf/8/properties/mcpAppUi/anyOf',
                                      keyword: 'anyOf',
                                      params: {},
                                      message: 'must match a schema in anyOf',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err76];
                                    } else {
                                      vErrors.push(err76);
                                    }
                                    errors++;
                                  } else {
                                    errors = _errs137;
                                    if (vErrors !== null) {
                                      if (_errs137) {
                                        vErrors.length = _errs137;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var valid21 = _errs136 === errors;
                                } else {
                                  var valid21 = true;
                                }
                                if (valid21) {
                                  if (data.pluginId !== void 0) {
                                    let data56 = data.pluginId;
                                    const _errs141 = errors;
                                    if (typeof data56 !== 'string' && data56 !== null) {
                                      const err77 = {
                                        instancePath: instancePath + '/pluginId',
                                        schemaPath: '#/oneOf/8/properties/pluginId/type',
                                        keyword: 'type',
                                        params: {
                                          type: schema45.oneOf[8].properties.pluginId.type,
                                        },
                                        message: 'must be string,null',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err77];
                                      } else {
                                        vErrors.push(err77);
                                      }
                                      errors++;
                                    }
                                    var valid21 = _errs141 === errors;
                                  } else {
                                    var valid21 = true;
                                  }
                                  if (valid21) {
                                    if (data.readOnlyHint !== void 0) {
                                      let data57 = data.readOnlyHint;
                                      const _errs143 = errors;
                                      if (typeof data57 !== 'boolean' && data57 !== null) {
                                        const err78 = {
                                          instancePath: instancePath + '/readOnlyHint',
                                          schemaPath: '#/oneOf/8/properties/readOnlyHint/type',
                                          keyword: 'type',
                                          params: {
                                            type: schema45.oneOf[8].properties.readOnlyHint.type,
                                          },
                                          message: 'must be boolean,null',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err78];
                                        } else {
                                          vErrors.push(err78);
                                        }
                                        errors++;
                                      }
                                      var valid21 = _errs143 === errors;
                                    } else {
                                      var valid21 = true;
                                    }
                                    if (valid21) {
                                      if (data.result !== void 0) {
                                        let data58 = data.result;
                                        const _errs145 = errors;
                                        const _errs146 = errors;
                                        let valid25 = false;
                                        const _errs147 = errors;
                                        if (
                                          !validate147(data58, {
                                            instancePath: instancePath + '/result',
                                            parentData: data,
                                            parentDataProperty: 'result',
                                            rootData,
                                          })
                                        ) {
                                          vErrors =
                                            vErrors === null
                                              ? validate147.errors
                                              : vErrors.concat(validate147.errors);
                                          errors = vErrors.length;
                                        }
                                        var _valid7 = _errs147 === errors;
                                        valid25 = valid25 || _valid7;
                                        if (!valid25) {
                                          const _errs148 = errors;
                                          if (data58 !== null) {
                                            const err79 = {
                                              instancePath: instancePath + '/result',
                                              schemaPath:
                                                '#/oneOf/8/properties/result/anyOf/1/type',
                                              keyword: 'type',
                                              params: { type: 'null' },
                                              message: 'must be null',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err79];
                                            } else {
                                              vErrors.push(err79);
                                            }
                                            errors++;
                                          }
                                          var _valid7 = _errs148 === errors;
                                          valid25 = valid25 || _valid7;
                                        }
                                        if (!valid25) {
                                          const err80 = {
                                            instancePath: instancePath + '/result',
                                            schemaPath: '#/oneOf/8/properties/result/anyOf',
                                            keyword: 'anyOf',
                                            params: {},
                                            message: 'must match a schema in anyOf',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err80];
                                          } else {
                                            vErrors.push(err80);
                                          }
                                          errors++;
                                        } else {
                                          errors = _errs146;
                                          if (vErrors !== null) {
                                            if (_errs146) {
                                              vErrors.length = _errs146;
                                            } else {
                                              vErrors = null;
                                            }
                                          }
                                        }
                                        var valid21 = _errs145 === errors;
                                      } else {
                                        var valid21 = true;
                                      }
                                      if (valid21) {
                                        if (data.server !== void 0) {
                                          const _errs150 = errors;
                                          if (typeof data.server !== 'string') {
                                            const err81 = {
                                              instancePath: instancePath + '/server',
                                              schemaPath: '#/oneOf/8/properties/server/type',
                                              keyword: 'type',
                                              params: { type: 'string' },
                                              message: 'must be string',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err81];
                                            } else {
                                              vErrors.push(err81);
                                            }
                                            errors++;
                                          }
                                          var valid21 = _errs150 === errors;
                                        } else {
                                          var valid21 = true;
                                        }
                                        if (valid21) {
                                          if (data.status !== void 0) {
                                            const _errs152 = errors;
                                            if (
                                              !validate149(data.status, {
                                                instancePath: instancePath + '/status',
                                                parentData: data,
                                                parentDataProperty: 'status',
                                                rootData,
                                              })
                                            ) {
                                              vErrors =
                                                vErrors === null
                                                  ? validate149.errors
                                                  : vErrors.concat(validate149.errors);
                                              errors = vErrors.length;
                                            }
                                            var valid21 = _errs152 === errors;
                                          } else {
                                            var valid21 = true;
                                          }
                                          if (valid21) {
                                            if (data.tool !== void 0) {
                                              const _errs153 = errors;
                                              if (typeof data.tool !== 'string') {
                                                const err82 = {
                                                  instancePath: instancePath + '/tool',
                                                  schemaPath: '#/oneOf/8/properties/tool/type',
                                                  keyword: 'type',
                                                  params: { type: 'string' },
                                                  message: 'must be string',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err82];
                                                } else {
                                                  vErrors.push(err82);
                                                }
                                                errors++;
                                              }
                                              var valid21 = _errs153 === errors;
                                            } else {
                                              var valid21 = true;
                                            }
                                            if (valid21) {
                                              if (data.type !== void 0) {
                                                let data62 = data.type;
                                                const _errs155 = errors;
                                                if (typeof data62 !== 'string') {
                                                  const err83 = {
                                                    instancePath: instancePath + '/type',
                                                    schemaPath: '#/oneOf/8/properties/type/type',
                                                    keyword: 'type',
                                                    params: { type: 'string' },
                                                    message: 'must be string',
                                                  };
                                                  if (vErrors === null) {
                                                    vErrors = [err83];
                                                  } else {
                                                    vErrors.push(err83);
                                                  }
                                                  errors++;
                                                }
                                                if (!(data62 === 'mcpToolCall')) {
                                                  const err84 = {
                                                    instancePath: instancePath + '/type',
                                                    schemaPath: '#/oneOf/8/properties/type/enum',
                                                    keyword: 'enum',
                                                    params: {
                                                      allowedValues:
                                                        schema45.oneOf[8].properties.type.enum,
                                                    },
                                                    message:
                                                      'must be equal to one of the allowed values',
                                                  };
                                                  if (vErrors === null) {
                                                    vErrors = [err84];
                                                  } else {
                                                    vErrors.push(err84);
                                                  }
                                                  errors++;
                                                }
                                                var valid21 = _errs155 === errors;
                                              } else {
                                                var valid21 = true;
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  } else {
                    const err85 = {
                      instancePath,
                      schemaPath: '#/oneOf/8/type',
                      keyword: 'type',
                      params: { type: 'object' },
                      message: 'must be object',
                    };
                    if (vErrors === null) {
                      vErrors = [err85];
                    } else {
                      vErrors.push(err85);
                    }
                    errors++;
                  }
                }
                var _valid0 = _errs118 === errors;
                if (_valid0 && valid0) {
                  valid0 = false;
                  passing0 = [passing0, 8];
                } else {
                  if (_valid0) {
                    valid0 = true;
                    passing0 = 8;
                  }
                  const _errs157 = errors;
                  if (errors === _errs157) {
                    if (data && typeof data == 'object' && !Array.isArray(data)) {
                      let missing9;
                      if (
                        (data.arguments === void 0 && (missing9 = 'arguments')) ||
                        (data.id === void 0 && (missing9 = 'id')) ||
                        (data.status === void 0 && (missing9 = 'status')) ||
                        (data.tool === void 0 && (missing9 = 'tool')) ||
                        (data.type === void 0 && (missing9 = 'type'))
                      ) {
                        const err86 = {
                          instancePath,
                          schemaPath: '#/oneOf/9/required',
                          keyword: 'required',
                          params: { missingProperty: missing9 },
                          message: "must have required property '" + missing9 + "'",
                        };
                        if (vErrors === null) {
                          vErrors = [err86];
                        } else {
                          vErrors.push(err86);
                        }
                        errors++;
                      } else {
                        if (data.contentItems !== void 0) {
                          let data63 = data.contentItems;
                          const _errs159 = errors;
                          if (!Array.isArray(data63) && data63 !== null) {
                            const err87 = {
                              instancePath: instancePath + '/contentItems',
                              schemaPath: '#/oneOf/9/properties/contentItems/type',
                              keyword: 'type',
                              params: { type: schema45.oneOf[9].properties.contentItems.type },
                              message: 'must be array,null',
                            };
                            if (vErrors === null) {
                              vErrors = [err87];
                            } else {
                              vErrors.push(err87);
                            }
                            errors++;
                          }
                          if (errors === _errs159) {
                            if (Array.isArray(data63)) {
                              var valid27 = true;
                              const len7 = data63.length;
                              for (let i7 = 0; i7 < len7; i7++) {
                                const _errs161 = errors;
                                if (
                                  !validate151(data63[i7], {
                                    instancePath: instancePath + '/contentItems/' + i7,
                                    parentData: data63,
                                    parentDataProperty: i7,
                                    rootData,
                                  })
                                ) {
                                  vErrors =
                                    vErrors === null
                                      ? validate151.errors
                                      : vErrors.concat(validate151.errors);
                                  errors = vErrors.length;
                                }
                                var valid27 = _errs161 === errors;
                                if (!valid27) {
                                  break;
                                }
                              }
                            }
                          }
                          var valid26 = _errs159 === errors;
                        } else {
                          var valid26 = true;
                        }
                        if (valid26) {
                          if (data.durationMs !== void 0) {
                            let data65 = data.durationMs;
                            const _errs162 = errors;
                            if (
                              !(typeof data65 == 'number' && !(data65 % 1) && !isNaN(data65)) &&
                              data65 !== null
                            ) {
                              const err88 = {
                                instancePath: instancePath + '/durationMs',
                                schemaPath: '#/oneOf/9/properties/durationMs/type',
                                keyword: 'type',
                                params: { type: schema45.oneOf[9].properties.durationMs.type },
                                message: 'must be integer,null',
                              };
                              if (vErrors === null) {
                                vErrors = [err88];
                              } else {
                                vErrors.push(err88);
                              }
                              errors++;
                            }
                            var valid26 = _errs162 === errors;
                          } else {
                            var valid26 = true;
                          }
                          if (valid26) {
                            if (data.id !== void 0) {
                              const _errs164 = errors;
                              if (typeof data.id !== 'string') {
                                const err89 = {
                                  instancePath: instancePath + '/id',
                                  schemaPath: '#/oneOf/9/properties/id/type',
                                  keyword: 'type',
                                  params: { type: 'string' },
                                  message: 'must be string',
                                };
                                if (vErrors === null) {
                                  vErrors = [err89];
                                } else {
                                  vErrors.push(err89);
                                }
                                errors++;
                              }
                              var valid26 = _errs164 === errors;
                            } else {
                              var valid26 = true;
                            }
                            if (valid26) {
                              if (data.namespace !== void 0) {
                                let data67 = data.namespace;
                                const _errs166 = errors;
                                if (typeof data67 !== 'string' && data67 !== null) {
                                  const err90 = {
                                    instancePath: instancePath + '/namespace',
                                    schemaPath: '#/oneOf/9/properties/namespace/type',
                                    keyword: 'type',
                                    params: { type: schema45.oneOf[9].properties.namespace.type },
                                    message: 'must be string,null',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err90];
                                  } else {
                                    vErrors.push(err90);
                                  }
                                  errors++;
                                }
                                var valid26 = _errs166 === errors;
                              } else {
                                var valid26 = true;
                              }
                              if (valid26) {
                                if (data.status !== void 0) {
                                  const _errs168 = errors;
                                  if (
                                    !validate153(data.status, {
                                      instancePath: instancePath + '/status',
                                      parentData: data,
                                      parentDataProperty: 'status',
                                      rootData,
                                    })
                                  ) {
                                    vErrors =
                                      vErrors === null
                                        ? validate153.errors
                                        : vErrors.concat(validate153.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid26 = _errs168 === errors;
                                } else {
                                  var valid26 = true;
                                }
                                if (valid26) {
                                  if (data.success !== void 0) {
                                    let data69 = data.success;
                                    const _errs169 = errors;
                                    if (typeof data69 !== 'boolean' && data69 !== null) {
                                      const err91 = {
                                        instancePath: instancePath + '/success',
                                        schemaPath: '#/oneOf/9/properties/success/type',
                                        keyword: 'type',
                                        params: { type: schema45.oneOf[9].properties.success.type },
                                        message: 'must be boolean,null',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err91];
                                      } else {
                                        vErrors.push(err91);
                                      }
                                      errors++;
                                    }
                                    var valid26 = _errs169 === errors;
                                  } else {
                                    var valid26 = true;
                                  }
                                  if (valid26) {
                                    if (data.tool !== void 0) {
                                      const _errs171 = errors;
                                      if (typeof data.tool !== 'string') {
                                        const err92 = {
                                          instancePath: instancePath + '/tool',
                                          schemaPath: '#/oneOf/9/properties/tool/type',
                                          keyword: 'type',
                                          params: { type: 'string' },
                                          message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err92];
                                        } else {
                                          vErrors.push(err92);
                                        }
                                        errors++;
                                      }
                                      var valid26 = _errs171 === errors;
                                    } else {
                                      var valid26 = true;
                                    }
                                    if (valid26) {
                                      if (data.type !== void 0) {
                                        let data71 = data.type;
                                        const _errs173 = errors;
                                        if (typeof data71 !== 'string') {
                                          const err93 = {
                                            instancePath: instancePath + '/type',
                                            schemaPath: '#/oneOf/9/properties/type/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err93];
                                          } else {
                                            vErrors.push(err93);
                                          }
                                          errors++;
                                        }
                                        if (!(data71 === 'dynamicToolCall')) {
                                          const err94 = {
                                            instancePath: instancePath + '/type',
                                            schemaPath: '#/oneOf/9/properties/type/enum',
                                            keyword: 'enum',
                                            params: {
                                              allowedValues: schema45.oneOf[9].properties.type.enum,
                                            },
                                            message: 'must be equal to one of the allowed values',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err94];
                                          } else {
                                            vErrors.push(err94);
                                          }
                                          errors++;
                                        }
                                        var valid26 = _errs173 === errors;
                                      } else {
                                        var valid26 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    } else {
                      const err95 = {
                        instancePath,
                        schemaPath: '#/oneOf/9/type',
                        keyword: 'type',
                        params: { type: 'object' },
                        message: 'must be object',
                      };
                      if (vErrors === null) {
                        vErrors = [err95];
                      } else {
                        vErrors.push(err95);
                      }
                      errors++;
                    }
                  }
                  var _valid0 = _errs157 === errors;
                  if (_valid0 && valid0) {
                    valid0 = false;
                    passing0 = [passing0, 9];
                  } else {
                    if (_valid0) {
                      valid0 = true;
                      passing0 = 9;
                    }
                    const _errs175 = errors;
                    if (errors === _errs175) {
                      if (data && typeof data == 'object' && !Array.isArray(data)) {
                        let missing10;
                        if (
                          (data.agentsStates === void 0 && (missing10 = 'agentsStates')) ||
                          (data.id === void 0 && (missing10 = 'id')) ||
                          (data.receiverThreadIds === void 0 &&
                            (missing10 = 'receiverThreadIds')) ||
                          (data.senderThreadId === void 0 && (missing10 = 'senderThreadId')) ||
                          (data.status === void 0 && (missing10 = 'status')) ||
                          (data.tool === void 0 && (missing10 = 'tool')) ||
                          (data.type === void 0 && (missing10 = 'type'))
                        ) {
                          const err96 = {
                            instancePath,
                            schemaPath: '#/oneOf/10/required',
                            keyword: 'required',
                            params: { missingProperty: missing10 },
                            message: "must have required property '" + missing10 + "'",
                          };
                          if (vErrors === null) {
                            vErrors = [err96];
                          } else {
                            vErrors.push(err96);
                          }
                          errors++;
                        } else {
                          if (data.agentsStates !== void 0) {
                            let data72 = data.agentsStates;
                            const _errs177 = errors;
                            if (errors === _errs177) {
                              if (data72 && typeof data72 == 'object' && !Array.isArray(data72)) {
                                for (const key0 in data72) {
                                  const _errs180 = errors;
                                  if (
                                    !validate155(data72[key0], {
                                      instancePath:
                                        instancePath +
                                        '/agentsStates/' +
                                        key0.replace(/~/g, '~0').replace(/\//g, '~1'),
                                      parentData: data72,
                                      parentDataProperty: key0,
                                      rootData,
                                    })
                                  ) {
                                    vErrors =
                                      vErrors === null
                                        ? validate155.errors
                                        : vErrors.concat(validate155.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid29 = _errs180 === errors;
                                  if (!valid29) {
                                    break;
                                  }
                                }
                              } else {
                                const err97 = {
                                  instancePath: instancePath + '/agentsStates',
                                  schemaPath: '#/oneOf/10/properties/agentsStates/type',
                                  keyword: 'type',
                                  params: { type: 'object' },
                                  message: 'must be object',
                                };
                                if (vErrors === null) {
                                  vErrors = [err97];
                                } else {
                                  vErrors.push(err97);
                                }
                                errors++;
                              }
                            }
                            var valid28 = _errs177 === errors;
                          } else {
                            var valid28 = true;
                          }
                          if (valid28) {
                            if (data.id !== void 0) {
                              const _errs181 = errors;
                              if (typeof data.id !== 'string') {
                                const err98 = {
                                  instancePath: instancePath + '/id',
                                  schemaPath: '#/oneOf/10/properties/id/type',
                                  keyword: 'type',
                                  params: { type: 'string' },
                                  message: 'must be string',
                                };
                                if (vErrors === null) {
                                  vErrors = [err98];
                                } else {
                                  vErrors.push(err98);
                                }
                                errors++;
                              }
                              var valid28 = _errs181 === errors;
                            } else {
                              var valid28 = true;
                            }
                            if (valid28) {
                              if (data.model !== void 0) {
                                let data75 = data.model;
                                const _errs183 = errors;
                                if (typeof data75 !== 'string' && data75 !== null) {
                                  const err99 = {
                                    instancePath: instancePath + '/model',
                                    schemaPath: '#/oneOf/10/properties/model/type',
                                    keyword: 'type',
                                    params: { type: schema45.oneOf[10].properties.model.type },
                                    message: 'must be string,null',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err99];
                                  } else {
                                    vErrors.push(err99);
                                  }
                                  errors++;
                                }
                                var valid28 = _errs183 === errors;
                              } else {
                                var valid28 = true;
                              }
                              if (valid28) {
                                if (data.prompt !== void 0) {
                                  let data76 = data.prompt;
                                  const _errs185 = errors;
                                  if (typeof data76 !== 'string' && data76 !== null) {
                                    const err100 = {
                                      instancePath: instancePath + '/prompt',
                                      schemaPath: '#/oneOf/10/properties/prompt/type',
                                      keyword: 'type',
                                      params: { type: schema45.oneOf[10].properties.prompt.type },
                                      message: 'must be string,null',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err100];
                                    } else {
                                      vErrors.push(err100);
                                    }
                                    errors++;
                                  }
                                  var valid28 = _errs185 === errors;
                                } else {
                                  var valid28 = true;
                                }
                                if (valid28) {
                                  if (data.reasoningEffort !== void 0) {
                                    let data77 = data.reasoningEffort;
                                    const _errs187 = errors;
                                    const _errs188 = errors;
                                    let valid30 = false;
                                    const _errs189 = errors;
                                    if (
                                      !validate56(data77, {
                                        instancePath: instancePath + '/reasoningEffort',
                                        parentData: data,
                                        parentDataProperty: 'reasoningEffort',
                                        rootData,
                                      })
                                    ) {
                                      vErrors =
                                        vErrors === null
                                          ? validate56.errors
                                          : vErrors.concat(validate56.errors);
                                      errors = vErrors.length;
                                    }
                                    var _valid8 = _errs189 === errors;
                                    valid30 = valid30 || _valid8;
                                    if (!valid30) {
                                      const _errs190 = errors;
                                      if (data77 !== null) {
                                        const err101 = {
                                          instancePath: instancePath + '/reasoningEffort',
                                          schemaPath:
                                            '#/oneOf/10/properties/reasoningEffort/anyOf/1/type',
                                          keyword: 'type',
                                          params: { type: 'null' },
                                          message: 'must be null',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err101];
                                        } else {
                                          vErrors.push(err101);
                                        }
                                        errors++;
                                      }
                                      var _valid8 = _errs190 === errors;
                                      valid30 = valid30 || _valid8;
                                    }
                                    if (!valid30) {
                                      const err102 = {
                                        instancePath: instancePath + '/reasoningEffort',
                                        schemaPath: '#/oneOf/10/properties/reasoningEffort/anyOf',
                                        keyword: 'anyOf',
                                        params: {},
                                        message: 'must match a schema in anyOf',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err102];
                                      } else {
                                        vErrors.push(err102);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs188;
                                      if (vErrors !== null) {
                                        if (_errs188) {
                                          vErrors.length = _errs188;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var valid28 = _errs187 === errors;
                                  } else {
                                    var valid28 = true;
                                  }
                                  if (valid28) {
                                    if (data.receiverThreadIds !== void 0) {
                                      let data78 = data.receiverThreadIds;
                                      const _errs192 = errors;
                                      if (errors === _errs192) {
                                        if (Array.isArray(data78)) {
                                          var valid31 = true;
                                          const len8 = data78.length;
                                          for (let i8 = 0; i8 < len8; i8++) {
                                            const _errs194 = errors;
                                            if (typeof data78[i8] !== 'string') {
                                              const err103 = {
                                                instancePath:
                                                  instancePath + '/receiverThreadIds/' + i8,
                                                schemaPath:
                                                  '#/oneOf/10/properties/receiverThreadIds/items/type',
                                                keyword: 'type',
                                                params: { type: 'string' },
                                                message: 'must be string',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err103];
                                              } else {
                                                vErrors.push(err103);
                                              }
                                              errors++;
                                            }
                                            var valid31 = _errs194 === errors;
                                            if (!valid31) {
                                              break;
                                            }
                                          }
                                        } else {
                                          const err104 = {
                                            instancePath: instancePath + '/receiverThreadIds',
                                            schemaPath:
                                              '#/oneOf/10/properties/receiverThreadIds/type',
                                            keyword: 'type',
                                            params: { type: 'array' },
                                            message: 'must be array',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err104];
                                          } else {
                                            vErrors.push(err104);
                                          }
                                          errors++;
                                        }
                                      }
                                      var valid28 = _errs192 === errors;
                                    } else {
                                      var valid28 = true;
                                    }
                                    if (valid28) {
                                      if (data.senderThreadId !== void 0) {
                                        const _errs196 = errors;
                                        if (typeof data.senderThreadId !== 'string') {
                                          const err105 = {
                                            instancePath: instancePath + '/senderThreadId',
                                            schemaPath: '#/oneOf/10/properties/senderThreadId/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err105];
                                          } else {
                                            vErrors.push(err105);
                                          }
                                          errors++;
                                        }
                                        var valid28 = _errs196 === errors;
                                      } else {
                                        var valid28 = true;
                                      }
                                      if (valid28) {
                                        if (data.status !== void 0) {
                                          const _errs198 = errors;
                                          if (
                                            !validate160(data.status, {
                                              instancePath: instancePath + '/status',
                                              parentData: data,
                                              parentDataProperty: 'status',
                                              rootData,
                                            })
                                          ) {
                                            vErrors =
                                              vErrors === null
                                                ? validate160.errors
                                                : vErrors.concat(validate160.errors);
                                            errors = vErrors.length;
                                          }
                                          var valid28 = _errs198 === errors;
                                        } else {
                                          var valid28 = true;
                                        }
                                        if (valid28) {
                                          if (data.tool !== void 0) {
                                            const _errs200 = errors;
                                            if (
                                              !validate162(data.tool, {
                                                instancePath: instancePath + '/tool',
                                                parentData: data,
                                                parentDataProperty: 'tool',
                                                rootData,
                                              })
                                            ) {
                                              vErrors =
                                                vErrors === null
                                                  ? validate162.errors
                                                  : vErrors.concat(validate162.errors);
                                              errors = vErrors.length;
                                            }
                                            var valid28 = _errs200 === errors;
                                          } else {
                                            var valid28 = true;
                                          }
                                          if (valid28) {
                                            if (data.type !== void 0) {
                                              let data83 = data.type;
                                              const _errs202 = errors;
                                              if (typeof data83 !== 'string') {
                                                const err106 = {
                                                  instancePath: instancePath + '/type',
                                                  schemaPath: '#/oneOf/10/properties/type/type',
                                                  keyword: 'type',
                                                  params: { type: 'string' },
                                                  message: 'must be string',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err106];
                                                } else {
                                                  vErrors.push(err106);
                                                }
                                                errors++;
                                              }
                                              if (!(data83 === 'collabAgentToolCall')) {
                                                const err107 = {
                                                  instancePath: instancePath + '/type',
                                                  schemaPath: '#/oneOf/10/properties/type/enum',
                                                  keyword: 'enum',
                                                  params: {
                                                    allowedValues:
                                                      schema45.oneOf[10].properties.type.enum,
                                                  },
                                                  message:
                                                    'must be equal to one of the allowed values',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err107];
                                                } else {
                                                  vErrors.push(err107);
                                                }
                                                errors++;
                                              }
                                              var valid28 = _errs202 === errors;
                                            } else {
                                              var valid28 = true;
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      } else {
                        const err108 = {
                          instancePath,
                          schemaPath: '#/oneOf/10/type',
                          keyword: 'type',
                          params: { type: 'object' },
                          message: 'must be object',
                        };
                        if (vErrors === null) {
                          vErrors = [err108];
                        } else {
                          vErrors.push(err108);
                        }
                        errors++;
                      }
                    }
                    var _valid0 = _errs175 === errors;
                    if (_valid0 && valid0) {
                      valid0 = false;
                      passing0 = [passing0, 10];
                    } else {
                      if (_valid0) {
                        valid0 = true;
                        passing0 = 10;
                      }
                      const _errs204 = errors;
                      if (errors === _errs204) {
                        if (data && typeof data == 'object' && !Array.isArray(data)) {
                          let missing11;
                          if (
                            (data.agentPath === void 0 && (missing11 = 'agentPath')) ||
                            (data.agentThreadId === void 0 && (missing11 = 'agentThreadId')) ||
                            (data.id === void 0 && (missing11 = 'id')) ||
                            (data.kind === void 0 && (missing11 = 'kind')) ||
                            (data.type === void 0 && (missing11 = 'type'))
                          ) {
                            const err109 = {
                              instancePath,
                              schemaPath: '#/oneOf/11/required',
                              keyword: 'required',
                              params: { missingProperty: missing11 },
                              message: "must have required property '" + missing11 + "'",
                            };
                            if (vErrors === null) {
                              vErrors = [err109];
                            } else {
                              vErrors.push(err109);
                            }
                            errors++;
                          } else {
                            if (data.agentPath !== void 0) {
                              const _errs206 = errors;
                              if (typeof data.agentPath !== 'string') {
                                const err110 = {
                                  instancePath: instancePath + '/agentPath',
                                  schemaPath: '#/oneOf/11/properties/agentPath/type',
                                  keyword: 'type',
                                  params: { type: 'string' },
                                  message: 'must be string',
                                };
                                if (vErrors === null) {
                                  vErrors = [err110];
                                } else {
                                  vErrors.push(err110);
                                }
                                errors++;
                              }
                              var valid34 = _errs206 === errors;
                            } else {
                              var valid34 = true;
                            }
                            if (valid34) {
                              if (data.agentThreadId !== void 0) {
                                const _errs208 = errors;
                                if (typeof data.agentThreadId !== 'string') {
                                  const err111 = {
                                    instancePath: instancePath + '/agentThreadId',
                                    schemaPath: '#/oneOf/11/properties/agentThreadId/type',
                                    keyword: 'type',
                                    params: { type: 'string' },
                                    message: 'must be string',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err111];
                                  } else {
                                    vErrors.push(err111);
                                  }
                                  errors++;
                                }
                                var valid34 = _errs208 === errors;
                              } else {
                                var valid34 = true;
                              }
                              if (valid34) {
                                if (data.id !== void 0) {
                                  const _errs210 = errors;
                                  if (typeof data.id !== 'string') {
                                    const err112 = {
                                      instancePath: instancePath + '/id',
                                      schemaPath: '#/oneOf/11/properties/id/type',
                                      keyword: 'type',
                                      params: { type: 'string' },
                                      message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err112];
                                    } else {
                                      vErrors.push(err112);
                                    }
                                    errors++;
                                  }
                                  var valid34 = _errs210 === errors;
                                } else {
                                  var valid34 = true;
                                }
                                if (valid34) {
                                  if (data.kind !== void 0) {
                                    const _errs212 = errors;
                                    if (
                                      !validate164(data.kind, {
                                        instancePath: instancePath + '/kind',
                                        parentData: data,
                                        parentDataProperty: 'kind',
                                        rootData,
                                      })
                                    ) {
                                      vErrors =
                                        vErrors === null
                                          ? validate164.errors
                                          : vErrors.concat(validate164.errors);
                                      errors = vErrors.length;
                                    }
                                    var valid34 = _errs212 === errors;
                                  } else {
                                    var valid34 = true;
                                  }
                                  if (valid34) {
                                    if (data.model !== void 0) {
                                      let data88 = data.model;
                                      const _errs213 = errors;
                                      if (typeof data88 !== 'string' && data88 !== null) {
                                        const err113 = {
                                          instancePath: instancePath + '/model',
                                          schemaPath: '#/oneOf/11/properties/model/type',
                                          keyword: 'type',
                                          params: {
                                            type: schema45.oneOf[11].properties.model.type,
                                          },
                                          message: 'must be string,null',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err113];
                                        } else {
                                          vErrors.push(err113);
                                        }
                                        errors++;
                                      }
                                      var valid34 = _errs213 === errors;
                                    } else {
                                      var valid34 = true;
                                    }
                                    if (valid34) {
                                      if (data.reasoningEffort !== void 0) {
                                        let data89 = data.reasoningEffort;
                                        const _errs215 = errors;
                                        const _errs216 = errors;
                                        let valid35 = false;
                                        const _errs217 = errors;
                                        if (
                                          !validate56(data89, {
                                            instancePath: instancePath + '/reasoningEffort',
                                            parentData: data,
                                            parentDataProperty: 'reasoningEffort',
                                            rootData,
                                          })
                                        ) {
                                          vErrors =
                                            vErrors === null
                                              ? validate56.errors
                                              : vErrors.concat(validate56.errors);
                                          errors = vErrors.length;
                                        }
                                        var _valid9 = _errs217 === errors;
                                        valid35 = valid35 || _valid9;
                                        if (!valid35) {
                                          const _errs218 = errors;
                                          if (data89 !== null) {
                                            const err114 = {
                                              instancePath: instancePath + '/reasoningEffort',
                                              schemaPath:
                                                '#/oneOf/11/properties/reasoningEffort/anyOf/1/type',
                                              keyword: 'type',
                                              params: { type: 'null' },
                                              message: 'must be null',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err114];
                                            } else {
                                              vErrors.push(err114);
                                            }
                                            errors++;
                                          }
                                          var _valid9 = _errs218 === errors;
                                          valid35 = valid35 || _valid9;
                                        }
                                        if (!valid35) {
                                          const err115 = {
                                            instancePath: instancePath + '/reasoningEffort',
                                            schemaPath:
                                              '#/oneOf/11/properties/reasoningEffort/anyOf',
                                            keyword: 'anyOf',
                                            params: {},
                                            message: 'must match a schema in anyOf',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err115];
                                          } else {
                                            vErrors.push(err115);
                                          }
                                          errors++;
                                        } else {
                                          errors = _errs216;
                                          if (vErrors !== null) {
                                            if (_errs216) {
                                              vErrors.length = _errs216;
                                            } else {
                                              vErrors = null;
                                            }
                                          }
                                        }
                                        var valid34 = _errs215 === errors;
                                      } else {
                                        var valid34 = true;
                                      }
                                      if (valid34) {
                                        if (data.type !== void 0) {
                                          let data90 = data.type;
                                          const _errs220 = errors;
                                          if (typeof data90 !== 'string') {
                                            const err116 = {
                                              instancePath: instancePath + '/type',
                                              schemaPath: '#/oneOf/11/properties/type/type',
                                              keyword: 'type',
                                              params: { type: 'string' },
                                              message: 'must be string',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err116];
                                            } else {
                                              vErrors.push(err116);
                                            }
                                            errors++;
                                          }
                                          if (!(data90 === 'subAgentActivity')) {
                                            const err117 = {
                                              instancePath: instancePath + '/type',
                                              schemaPath: '#/oneOf/11/properties/type/enum',
                                              keyword: 'enum',
                                              params: {
                                                allowedValues:
                                                  schema45.oneOf[11].properties.type.enum,
                                              },
                                              message: 'must be equal to one of the allowed values',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err117];
                                            } else {
                                              vErrors.push(err117);
                                            }
                                            errors++;
                                          }
                                          var valid34 = _errs220 === errors;
                                        } else {
                                          var valid34 = true;
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          const err118 = {
                            instancePath,
                            schemaPath: '#/oneOf/11/type',
                            keyword: 'type',
                            params: { type: 'object' },
                            message: 'must be object',
                          };
                          if (vErrors === null) {
                            vErrors = [err118];
                          } else {
                            vErrors.push(err118);
                          }
                          errors++;
                        }
                      }
                      var _valid0 = _errs204 === errors;
                      if (_valid0 && valid0) {
                        valid0 = false;
                        passing0 = [passing0, 11];
                      } else {
                        if (_valid0) {
                          valid0 = true;
                          passing0 = 11;
                        }
                        const _errs222 = errors;
                        if (errors === _errs222) {
                          if (data && typeof data == 'object' && !Array.isArray(data)) {
                            let missing12;
                            if (
                              (data.id === void 0 && (missing12 = 'id')) ||
                              (data.query === void 0 && (missing12 = 'query')) ||
                              (data.type === void 0 && (missing12 = 'type'))
                            ) {
                              const err119 = {
                                instancePath,
                                schemaPath: '#/oneOf/12/required',
                                keyword: 'required',
                                params: { missingProperty: missing12 },
                                message: "must have required property '" + missing12 + "'",
                              };
                              if (vErrors === null) {
                                vErrors = [err119];
                              } else {
                                vErrors.push(err119);
                              }
                              errors++;
                            } else {
                              if (data.action !== void 0) {
                                let data91 = data.action;
                                const _errs224 = errors;
                                const _errs225 = errors;
                                let valid37 = false;
                                const _errs226 = errors;
                                if (
                                  !validate167(data91, {
                                    instancePath: instancePath + '/action',
                                    parentData: data,
                                    parentDataProperty: 'action',
                                    rootData,
                                  })
                                ) {
                                  vErrors =
                                    vErrors === null
                                      ? validate167.errors
                                      : vErrors.concat(validate167.errors);
                                  errors = vErrors.length;
                                }
                                var _valid10 = _errs226 === errors;
                                valid37 = valid37 || _valid10;
                                if (!valid37) {
                                  const _errs227 = errors;
                                  if (data91 !== null) {
                                    const err120 = {
                                      instancePath: instancePath + '/action',
                                      schemaPath: '#/oneOf/12/properties/action/anyOf/1/type',
                                      keyword: 'type',
                                      params: { type: 'null' },
                                      message: 'must be null',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err120];
                                    } else {
                                      vErrors.push(err120);
                                    }
                                    errors++;
                                  }
                                  var _valid10 = _errs227 === errors;
                                  valid37 = valid37 || _valid10;
                                }
                                if (!valid37) {
                                  const err121 = {
                                    instancePath: instancePath + '/action',
                                    schemaPath: '#/oneOf/12/properties/action/anyOf',
                                    keyword: 'anyOf',
                                    params: {},
                                    message: 'must match a schema in anyOf',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err121];
                                  } else {
                                    vErrors.push(err121);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs225;
                                  if (vErrors !== null) {
                                    if (_errs225) {
                                      vErrors.length = _errs225;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid36 = _errs224 === errors;
                              } else {
                                var valid36 = true;
                              }
                              if (valid36) {
                                if (data.id !== void 0) {
                                  const _errs229 = errors;
                                  if (typeof data.id !== 'string') {
                                    const err122 = {
                                      instancePath: instancePath + '/id',
                                      schemaPath: '#/oneOf/12/properties/id/type',
                                      keyword: 'type',
                                      params: { type: 'string' },
                                      message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err122];
                                    } else {
                                      vErrors.push(err122);
                                    }
                                    errors++;
                                  }
                                  var valid36 = _errs229 === errors;
                                } else {
                                  var valid36 = true;
                                }
                                if (valid36) {
                                  if (data.query !== void 0) {
                                    const _errs231 = errors;
                                    if (typeof data.query !== 'string') {
                                      const err123 = {
                                        instancePath: instancePath + '/query',
                                        schemaPath: '#/oneOf/12/properties/query/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err123];
                                      } else {
                                        vErrors.push(err123);
                                      }
                                      errors++;
                                    }
                                    var valid36 = _errs231 === errors;
                                  } else {
                                    var valid36 = true;
                                  }
                                  if (valid36) {
                                    if (data.results !== void 0) {
                                      let data94 = data.results;
                                      const _errs233 = errors;
                                      if (!Array.isArray(data94) && data94 !== null) {
                                        const err124 = {
                                          instancePath: instancePath + '/results',
                                          schemaPath: '#/oneOf/12/properties/results/type',
                                          keyword: 'type',
                                          params: {
                                            type: schema45.oneOf[12].properties.results.type,
                                          },
                                          message: 'must be array,null',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err124];
                                        } else {
                                          vErrors.push(err124);
                                        }
                                        errors++;
                                      }
                                      var valid36 = _errs233 === errors;
                                    } else {
                                      var valid36 = true;
                                    }
                                    if (valid36) {
                                      if (data.type !== void 0) {
                                        let data95 = data.type;
                                        const _errs235 = errors;
                                        if (typeof data95 !== 'string') {
                                          const err125 = {
                                            instancePath: instancePath + '/type',
                                            schemaPath: '#/oneOf/12/properties/type/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err125];
                                          } else {
                                            vErrors.push(err125);
                                          }
                                          errors++;
                                        }
                                        if (!(data95 === 'webSearch')) {
                                          const err126 = {
                                            instancePath: instancePath + '/type',
                                            schemaPath: '#/oneOf/12/properties/type/enum',
                                            keyword: 'enum',
                                            params: {
                                              allowedValues:
                                                schema45.oneOf[12].properties.type.enum,
                                            },
                                            message: 'must be equal to one of the allowed values',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err126];
                                          } else {
                                            vErrors.push(err126);
                                          }
                                          errors++;
                                        }
                                        var valid36 = _errs235 === errors;
                                      } else {
                                        var valid36 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            const err127 = {
                              instancePath,
                              schemaPath: '#/oneOf/12/type',
                              keyword: 'type',
                              params: { type: 'object' },
                              message: 'must be object',
                            };
                            if (vErrors === null) {
                              vErrors = [err127];
                            } else {
                              vErrors.push(err127);
                            }
                            errors++;
                          }
                        }
                        var _valid0 = _errs222 === errors;
                        if (_valid0 && valid0) {
                          valid0 = false;
                          passing0 = [passing0, 12];
                        } else {
                          if (_valid0) {
                            valid0 = true;
                            passing0 = 12;
                          }
                          const _errs237 = errors;
                          if (errors === _errs237) {
                            if (data && typeof data == 'object' && !Array.isArray(data)) {
                              let missing13;
                              if (
                                (data.id === void 0 && (missing13 = 'id')) ||
                                (data.path === void 0 && (missing13 = 'path')) ||
                                (data.type === void 0 && (missing13 = 'type'))
                              ) {
                                const err128 = {
                                  instancePath,
                                  schemaPath: '#/oneOf/13/required',
                                  keyword: 'required',
                                  params: { missingProperty: missing13 },
                                  message: "must have required property '" + missing13 + "'",
                                };
                                if (vErrors === null) {
                                  vErrors = [err128];
                                } else {
                                  vErrors.push(err128);
                                }
                                errors++;
                              } else {
                                if (data.id !== void 0) {
                                  const _errs239 = errors;
                                  if (typeof data.id !== 'string') {
                                    const err129 = {
                                      instancePath: instancePath + '/id',
                                      schemaPath: '#/oneOf/13/properties/id/type',
                                      keyword: 'type',
                                      params: { type: 'string' },
                                      message: 'must be string',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err129];
                                    } else {
                                      vErrors.push(err129);
                                    }
                                    errors++;
                                  }
                                  var valid38 = _errs239 === errors;
                                } else {
                                  var valid38 = true;
                                }
                                if (valid38) {
                                  if (data.path !== void 0) {
                                    const _errs241 = errors;
                                    if (
                                      !validate54(data.path, {
                                        instancePath: instancePath + '/path',
                                        parentData: data,
                                        parentDataProperty: 'path',
                                        rootData,
                                      })
                                    ) {
                                      vErrors =
                                        vErrors === null
                                          ? validate54.errors
                                          : vErrors.concat(validate54.errors);
                                      errors = vErrors.length;
                                    }
                                    var valid38 = _errs241 === errors;
                                  } else {
                                    var valid38 = true;
                                  }
                                  if (valid38) {
                                    if (data.type !== void 0) {
                                      let data98 = data.type;
                                      const _errs242 = errors;
                                      if (typeof data98 !== 'string') {
                                        const err130 = {
                                          instancePath: instancePath + '/type',
                                          schemaPath: '#/oneOf/13/properties/type/type',
                                          keyword: 'type',
                                          params: { type: 'string' },
                                          message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err130];
                                        } else {
                                          vErrors.push(err130);
                                        }
                                        errors++;
                                      }
                                      if (!(data98 === 'imageView')) {
                                        const err131 = {
                                          instancePath: instancePath + '/type',
                                          schemaPath: '#/oneOf/13/properties/type/enum',
                                          keyword: 'enum',
                                          params: {
                                            allowedValues: schema45.oneOf[13].properties.type.enum,
                                          },
                                          message: 'must be equal to one of the allowed values',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err131];
                                        } else {
                                          vErrors.push(err131);
                                        }
                                        errors++;
                                      }
                                      var valid38 = _errs242 === errors;
                                    } else {
                                      var valid38 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              const err132 = {
                                instancePath,
                                schemaPath: '#/oneOf/13/type',
                                keyword: 'type',
                                params: { type: 'object' },
                                message: 'must be object',
                              };
                              if (vErrors === null) {
                                vErrors = [err132];
                              } else {
                                vErrors.push(err132);
                              }
                              errors++;
                            }
                          }
                          var _valid0 = _errs237 === errors;
                          if (_valid0 && valid0) {
                            valid0 = false;
                            passing0 = [passing0, 13];
                          } else {
                            if (_valid0) {
                              valid0 = true;
                              passing0 = 13;
                            }
                            const _errs244 = errors;
                            if (errors === _errs244) {
                              if (data && typeof data == 'object' && !Array.isArray(data)) {
                                let missing14;
                                if (
                                  (data.durationMs === void 0 && (missing14 = 'durationMs')) ||
                                  (data.id === void 0 && (missing14 = 'id')) ||
                                  (data.type === void 0 && (missing14 = 'type'))
                                ) {
                                  const err133 = {
                                    instancePath,
                                    schemaPath: '#/oneOf/14/required',
                                    keyword: 'required',
                                    params: { missingProperty: missing14 },
                                    message: "must have required property '" + missing14 + "'",
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err133];
                                  } else {
                                    vErrors.push(err133);
                                  }
                                  errors++;
                                } else {
                                  if (data.durationMs !== void 0) {
                                    let data99 = data.durationMs;
                                    const _errs246 = errors;
                                    if (!(
                                      typeof data99 == 'number' &&
                                      !(data99 % 1) &&
                                      !isNaN(data99)
                                    )) {
                                      const err134 = {
                                        instancePath: instancePath + '/durationMs',
                                        schemaPath: '#/oneOf/14/properties/durationMs/type',
                                        keyword: 'type',
                                        params: { type: 'integer' },
                                        message: 'must be integer',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err134];
                                      } else {
                                        vErrors.push(err134);
                                      }
                                      errors++;
                                    }
                                    if (errors === _errs246) {
                                      if (typeof data99 == 'number') {
                                        if (data99 < 0 || isNaN(data99)) {
                                          const err135 = {
                                            instancePath: instancePath + '/durationMs',
                                            schemaPath: '#/oneOf/14/properties/durationMs/minimum',
                                            keyword: 'minimum',
                                            params: { comparison: '>=', limit: 0 },
                                            message: 'must be >= 0',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err135];
                                          } else {
                                            vErrors.push(err135);
                                          }
                                          errors++;
                                        }
                                      }
                                    }
                                    var valid39 = _errs246 === errors;
                                  } else {
                                    var valid39 = true;
                                  }
                                  if (valid39) {
                                    if (data.id !== void 0) {
                                      const _errs248 = errors;
                                      if (typeof data.id !== 'string') {
                                        const err136 = {
                                          instancePath: instancePath + '/id',
                                          schemaPath: '#/oneOf/14/properties/id/type',
                                          keyword: 'type',
                                          params: { type: 'string' },
                                          message: 'must be string',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err136];
                                        } else {
                                          vErrors.push(err136);
                                        }
                                        errors++;
                                      }
                                      var valid39 = _errs248 === errors;
                                    } else {
                                      var valid39 = true;
                                    }
                                    if (valid39) {
                                      if (data.type !== void 0) {
                                        let data101 = data.type;
                                        const _errs250 = errors;
                                        if (typeof data101 !== 'string') {
                                          const err137 = {
                                            instancePath: instancePath + '/type',
                                            schemaPath: '#/oneOf/14/properties/type/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err137];
                                          } else {
                                            vErrors.push(err137);
                                          }
                                          errors++;
                                        }
                                        if (!(data101 === 'sleep')) {
                                          const err138 = {
                                            instancePath: instancePath + '/type',
                                            schemaPath: '#/oneOf/14/properties/type/enum',
                                            keyword: 'enum',
                                            params: {
                                              allowedValues:
                                                schema45.oneOf[14].properties.type.enum,
                                            },
                                            message: 'must be equal to one of the allowed values',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err138];
                                          } else {
                                            vErrors.push(err138);
                                          }
                                          errors++;
                                        }
                                        var valid39 = _errs250 === errors;
                                      } else {
                                        var valid39 = true;
                                      }
                                    }
                                  }
                                }
                              } else {
                                const err139 = {
                                  instancePath,
                                  schemaPath: '#/oneOf/14/type',
                                  keyword: 'type',
                                  params: { type: 'object' },
                                  message: 'must be object',
                                };
                                if (vErrors === null) {
                                  vErrors = [err139];
                                } else {
                                  vErrors.push(err139);
                                }
                                errors++;
                              }
                            }
                            var _valid0 = _errs244 === errors;
                            if (_valid0 && valid0) {
                              valid0 = false;
                              passing0 = [passing0, 14];
                            } else {
                              if (_valid0) {
                                valid0 = true;
                                passing0 = 14;
                              }
                              const _errs252 = errors;
                              if (errors === _errs252) {
                                if (data && typeof data == 'object' && !Array.isArray(data)) {
                                  let missing15;
                                  if (
                                    (data.id === void 0 && (missing15 = 'id')) ||
                                    (data.result === void 0 && (missing15 = 'result')) ||
                                    (data.status === void 0 && (missing15 = 'status')) ||
                                    (data.type === void 0 && (missing15 = 'type'))
                                  ) {
                                    const err140 = {
                                      instancePath,
                                      schemaPath: '#/oneOf/15/required',
                                      keyword: 'required',
                                      params: { missingProperty: missing15 },
                                      message: "must have required property '" + missing15 + "'",
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err140];
                                    } else {
                                      vErrors.push(err140);
                                    }
                                    errors++;
                                  } else {
                                    if (data.failure !== void 0) {
                                      let data102 = data.failure;
                                      const _errs254 = errors;
                                      const _errs255 = errors;
                                      let valid41 = false;
                                      const _errs256 = errors;
                                      if (
                                        !validate170(data102, {
                                          instancePath: instancePath + '/failure',
                                          parentData: data,
                                          parentDataProperty: 'failure',
                                          rootData,
                                        })
                                      ) {
                                        vErrors =
                                          vErrors === null
                                            ? validate170.errors
                                            : vErrors.concat(validate170.errors);
                                        errors = vErrors.length;
                                      }
                                      var _valid11 = _errs256 === errors;
                                      valid41 = valid41 || _valid11;
                                      if (!valid41) {
                                        const _errs257 = errors;
                                        if (data102 !== null) {
                                          const err141 = {
                                            instancePath: instancePath + '/failure',
                                            schemaPath:
                                              '#/oneOf/15/properties/failure/anyOf/1/type',
                                            keyword: 'type',
                                            params: { type: 'null' },
                                            message: 'must be null',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err141];
                                          } else {
                                            vErrors.push(err141);
                                          }
                                          errors++;
                                        }
                                        var _valid11 = _errs257 === errors;
                                        valid41 = valid41 || _valid11;
                                      }
                                      if (!valid41) {
                                        const err142 = {
                                          instancePath: instancePath + '/failure',
                                          schemaPath: '#/oneOf/15/properties/failure/anyOf',
                                          keyword: 'anyOf',
                                          params: {},
                                          message: 'must match a schema in anyOf',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err142];
                                        } else {
                                          vErrors.push(err142);
                                        }
                                        errors++;
                                      } else {
                                        errors = _errs255;
                                        if (vErrors !== null) {
                                          if (_errs255) {
                                            vErrors.length = _errs255;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid40 = _errs254 === errors;
                                    } else {
                                      var valid40 = true;
                                    }
                                    if (valid40) {
                                      if (data.id !== void 0) {
                                        const _errs259 = errors;
                                        if (typeof data.id !== 'string') {
                                          const err143 = {
                                            instancePath: instancePath + '/id',
                                            schemaPath: '#/oneOf/15/properties/id/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err143];
                                          } else {
                                            vErrors.push(err143);
                                          }
                                          errors++;
                                        }
                                        var valid40 = _errs259 === errors;
                                      } else {
                                        var valid40 = true;
                                      }
                                      if (valid40) {
                                        if (data.result !== void 0) {
                                          const _errs261 = errors;
                                          if (typeof data.result !== 'string') {
                                            const err144 = {
                                              instancePath: instancePath + '/result',
                                              schemaPath: '#/oneOf/15/properties/result/type',
                                              keyword: 'type',
                                              params: { type: 'string' },
                                              message: 'must be string',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err144];
                                            } else {
                                              vErrors.push(err144);
                                            }
                                            errors++;
                                          }
                                          var valid40 = _errs261 === errors;
                                        } else {
                                          var valid40 = true;
                                        }
                                        if (valid40) {
                                          if (data.revisedPrompt !== void 0) {
                                            let data105 = data.revisedPrompt;
                                            const _errs263 = errors;
                                            if (typeof data105 !== 'string' && data105 !== null) {
                                              const err145 = {
                                                instancePath: instancePath + '/revisedPrompt',
                                                schemaPath:
                                                  '#/oneOf/15/properties/revisedPrompt/type',
                                                keyword: 'type',
                                                params: {
                                                  type: schema45.oneOf[15].properties.revisedPrompt
                                                    .type,
                                                },
                                                message: 'must be string,null',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err145];
                                              } else {
                                                vErrors.push(err145);
                                              }
                                              errors++;
                                            }
                                            var valid40 = _errs263 === errors;
                                          } else {
                                            var valid40 = true;
                                          }
                                          if (valid40) {
                                            if (data.savedPath !== void 0) {
                                              let data106 = data.savedPath;
                                              const _errs265 = errors;
                                              const _errs266 = errors;
                                              let valid42 = false;
                                              const _errs267 = errors;
                                              if (
                                                !validate31(data106, {
                                                  instancePath: instancePath + '/savedPath',
                                                  parentData: data,
                                                  parentDataProperty: 'savedPath',
                                                  rootData,
                                                })
                                              ) {
                                                vErrors =
                                                  vErrors === null
                                                    ? validate31.errors
                                                    : vErrors.concat(validate31.errors);
                                                errors = vErrors.length;
                                              }
                                              var _valid12 = _errs267 === errors;
                                              valid42 = valid42 || _valid12;
                                              if (!valid42) {
                                                const _errs268 = errors;
                                                if (data106 !== null) {
                                                  const err146 = {
                                                    instancePath: instancePath + '/savedPath',
                                                    schemaPath:
                                                      '#/oneOf/15/properties/savedPath/anyOf/1/type',
                                                    keyword: 'type',
                                                    params: { type: 'null' },
                                                    message: 'must be null',
                                                  };
                                                  if (vErrors === null) {
                                                    vErrors = [err146];
                                                  } else {
                                                    vErrors.push(err146);
                                                  }
                                                  errors++;
                                                }
                                                var _valid12 = _errs268 === errors;
                                                valid42 = valid42 || _valid12;
                                              }
                                              if (!valid42) {
                                                const err147 = {
                                                  instancePath: instancePath + '/savedPath',
                                                  schemaPath:
                                                    '#/oneOf/15/properties/savedPath/anyOf',
                                                  keyword: 'anyOf',
                                                  params: {},
                                                  message: 'must match a schema in anyOf',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err147];
                                                } else {
                                                  vErrors.push(err147);
                                                }
                                                errors++;
                                              } else {
                                                errors = _errs266;
                                                if (vErrors !== null) {
                                                  if (_errs266) {
                                                    vErrors.length = _errs266;
                                                  } else {
                                                    vErrors = null;
                                                  }
                                                }
                                              }
                                              var valid40 = _errs265 === errors;
                                            } else {
                                              var valid40 = true;
                                            }
                                            if (valid40) {
                                              if (data.status !== void 0) {
                                                const _errs270 = errors;
                                                if (typeof data.status !== 'string') {
                                                  const err148 = {
                                                    instancePath: instancePath + '/status',
                                                    schemaPath: '#/oneOf/15/properties/status/type',
                                                    keyword: 'type',
                                                    params: { type: 'string' },
                                                    message: 'must be string',
                                                  };
                                                  if (vErrors === null) {
                                                    vErrors = [err148];
                                                  } else {
                                                    vErrors.push(err148);
                                                  }
                                                  errors++;
                                                }
                                                var valid40 = _errs270 === errors;
                                              } else {
                                                var valid40 = true;
                                              }
                                              if (valid40) {
                                                if (data.transparentBackground !== void 0) {
                                                  let data108 = data.transparentBackground;
                                                  const _errs272 = errors;
                                                  if (
                                                    typeof data108 !== 'boolean' &&
                                                    data108 !== null
                                                  ) {
                                                    const err149 = {
                                                      instancePath:
                                                        instancePath + '/transparentBackground',
                                                      schemaPath:
                                                        '#/oneOf/15/properties/transparentBackground/type',
                                                      keyword: 'type',
                                                      params: {
                                                        type: schema45.oneOf[15].properties
                                                          .transparentBackground.type,
                                                      },
                                                      message: 'must be boolean,null',
                                                    };
                                                    if (vErrors === null) {
                                                      vErrors = [err149];
                                                    } else {
                                                      vErrors.push(err149);
                                                    }
                                                    errors++;
                                                  }
                                                  var valid40 = _errs272 === errors;
                                                } else {
                                                  var valid40 = true;
                                                }
                                                if (valid40) {
                                                  if (data.type !== void 0) {
                                                    let data109 = data.type;
                                                    const _errs274 = errors;
                                                    if (typeof data109 !== 'string') {
                                                      const err150 = {
                                                        instancePath: instancePath + '/type',
                                                        schemaPath:
                                                          '#/oneOf/15/properties/type/type',
                                                        keyword: 'type',
                                                        params: { type: 'string' },
                                                        message: 'must be string',
                                                      };
                                                      if (vErrors === null) {
                                                        vErrors = [err150];
                                                      } else {
                                                        vErrors.push(err150);
                                                      }
                                                      errors++;
                                                    }
                                                    if (!(data109 === 'imageGeneration')) {
                                                      const err151 = {
                                                        instancePath: instancePath + '/type',
                                                        schemaPath:
                                                          '#/oneOf/15/properties/type/enum',
                                                        keyword: 'enum',
                                                        params: {
                                                          allowedValues:
                                                            schema45.oneOf[15].properties.type.enum,
                                                        },
                                                        message:
                                                          'must be equal to one of the allowed values',
                                                      };
                                                      if (vErrors === null) {
                                                        vErrors = [err151];
                                                      } else {
                                                        vErrors.push(err151);
                                                      }
                                                      errors++;
                                                    }
                                                    var valid40 = _errs274 === errors;
                                                  } else {
                                                    var valid40 = true;
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                } else {
                                  const err152 = {
                                    instancePath,
                                    schemaPath: '#/oneOf/15/type',
                                    keyword: 'type',
                                    params: { type: 'object' },
                                    message: 'must be object',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err152];
                                  } else {
                                    vErrors.push(err152);
                                  }
                                  errors++;
                                }
                              }
                              var _valid0 = _errs252 === errors;
                              if (_valid0 && valid0) {
                                valid0 = false;
                                passing0 = [passing0, 15];
                              } else {
                                if (_valid0) {
                                  valid0 = true;
                                  passing0 = 15;
                                }
                                const _errs276 = errors;
                                if (errors === _errs276) {
                                  if (data && typeof data == 'object' && !Array.isArray(data)) {
                                    let missing16;
                                    if (
                                      (data.id === void 0 && (missing16 = 'id')) ||
                                      (data.review === void 0 && (missing16 = 'review')) ||
                                      (data.type === void 0 && (missing16 = 'type'))
                                    ) {
                                      const err153 = {
                                        instancePath,
                                        schemaPath: '#/oneOf/16/required',
                                        keyword: 'required',
                                        params: { missingProperty: missing16 },
                                        message: "must have required property '" + missing16 + "'",
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err153];
                                      } else {
                                        vErrors.push(err153);
                                      }
                                      errors++;
                                    } else {
                                      if (data.id !== void 0) {
                                        const _errs278 = errors;
                                        if (typeof data.id !== 'string') {
                                          const err154 = {
                                            instancePath: instancePath + '/id',
                                            schemaPath: '#/oneOf/16/properties/id/type',
                                            keyword: 'type',
                                            params: { type: 'string' },
                                            message: 'must be string',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err154];
                                          } else {
                                            vErrors.push(err154);
                                          }
                                          errors++;
                                        }
                                        var valid43 = _errs278 === errors;
                                      } else {
                                        var valid43 = true;
                                      }
                                      if (valid43) {
                                        if (data.review !== void 0) {
                                          const _errs280 = errors;
                                          if (typeof data.review !== 'string') {
                                            const err155 = {
                                              instancePath: instancePath + '/review',
                                              schemaPath: '#/oneOf/16/properties/review/type',
                                              keyword: 'type',
                                              params: { type: 'string' },
                                              message: 'must be string',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err155];
                                            } else {
                                              vErrors.push(err155);
                                            }
                                            errors++;
                                          }
                                          var valid43 = _errs280 === errors;
                                        } else {
                                          var valid43 = true;
                                        }
                                        if (valid43) {
                                          if (data.type !== void 0) {
                                            let data112 = data.type;
                                            const _errs282 = errors;
                                            if (typeof data112 !== 'string') {
                                              const err156 = {
                                                instancePath: instancePath + '/type',
                                                schemaPath: '#/oneOf/16/properties/type/type',
                                                keyword: 'type',
                                                params: { type: 'string' },
                                                message: 'must be string',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err156];
                                              } else {
                                                vErrors.push(err156);
                                              }
                                              errors++;
                                            }
                                            if (!(data112 === 'enteredReviewMode')) {
                                              const err157 = {
                                                instancePath: instancePath + '/type',
                                                schemaPath: '#/oneOf/16/properties/type/enum',
                                                keyword: 'enum',
                                                params: {
                                                  allowedValues:
                                                    schema45.oneOf[16].properties.type.enum,
                                                },
                                                message:
                                                  'must be equal to one of the allowed values',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err157];
                                              } else {
                                                vErrors.push(err157);
                                              }
                                              errors++;
                                            }
                                            var valid43 = _errs282 === errors;
                                          } else {
                                            var valid43 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err158 = {
                                      instancePath,
                                      schemaPath: '#/oneOf/16/type',
                                      keyword: 'type',
                                      params: { type: 'object' },
                                      message: 'must be object',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err158];
                                    } else {
                                      vErrors.push(err158);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid0 = _errs276 === errors;
                                if (_valid0 && valid0) {
                                  valid0 = false;
                                  passing0 = [passing0, 16];
                                } else {
                                  if (_valid0) {
                                    valid0 = true;
                                    passing0 = 16;
                                  }
                                  const _errs284 = errors;
                                  if (errors === _errs284) {
                                    if (data && typeof data == 'object' && !Array.isArray(data)) {
                                      let missing17;
                                      if (
                                        (data.id === void 0 && (missing17 = 'id')) ||
                                        (data.review === void 0 && (missing17 = 'review')) ||
                                        (data.type === void 0 && (missing17 = 'type'))
                                      ) {
                                        const err159 = {
                                          instancePath,
                                          schemaPath: '#/oneOf/17/required',
                                          keyword: 'required',
                                          params: { missingProperty: missing17 },
                                          message:
                                            "must have required property '" + missing17 + "'",
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err159];
                                        } else {
                                          vErrors.push(err159);
                                        }
                                        errors++;
                                      } else {
                                        if (data.id !== void 0) {
                                          const _errs286 = errors;
                                          if (typeof data.id !== 'string') {
                                            const err160 = {
                                              instancePath: instancePath + '/id',
                                              schemaPath: '#/oneOf/17/properties/id/type',
                                              keyword: 'type',
                                              params: { type: 'string' },
                                              message: 'must be string',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err160];
                                            } else {
                                              vErrors.push(err160);
                                            }
                                            errors++;
                                          }
                                          var valid44 = _errs286 === errors;
                                        } else {
                                          var valid44 = true;
                                        }
                                        if (valid44) {
                                          if (data.review !== void 0) {
                                            const _errs288 = errors;
                                            if (typeof data.review !== 'string') {
                                              const err161 = {
                                                instancePath: instancePath + '/review',
                                                schemaPath: '#/oneOf/17/properties/review/type',
                                                keyword: 'type',
                                                params: { type: 'string' },
                                                message: 'must be string',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err161];
                                              } else {
                                                vErrors.push(err161);
                                              }
                                              errors++;
                                            }
                                            var valid44 = _errs288 === errors;
                                          } else {
                                            var valid44 = true;
                                          }
                                          if (valid44) {
                                            if (data.type !== void 0) {
                                              let data115 = data.type;
                                              const _errs290 = errors;
                                              if (typeof data115 !== 'string') {
                                                const err162 = {
                                                  instancePath: instancePath + '/type',
                                                  schemaPath: '#/oneOf/17/properties/type/type',
                                                  keyword: 'type',
                                                  params: { type: 'string' },
                                                  message: 'must be string',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err162];
                                                } else {
                                                  vErrors.push(err162);
                                                }
                                                errors++;
                                              }
                                              if (!(data115 === 'exitedReviewMode')) {
                                                const err163 = {
                                                  instancePath: instancePath + '/type',
                                                  schemaPath: '#/oneOf/17/properties/type/enum',
                                                  keyword: 'enum',
                                                  params: {
                                                    allowedValues:
                                                      schema45.oneOf[17].properties.type.enum,
                                                  },
                                                  message:
                                                    'must be equal to one of the allowed values',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err163];
                                                } else {
                                                  vErrors.push(err163);
                                                }
                                                errors++;
                                              }
                                              var valid44 = _errs290 === errors;
                                            } else {
                                              var valid44 = true;
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      const err164 = {
                                        instancePath,
                                        schemaPath: '#/oneOf/17/type',
                                        keyword: 'type',
                                        params: { type: 'object' },
                                        message: 'must be object',
                                      };
                                      if (vErrors === null) {
                                        vErrors = [err164];
                                      } else {
                                        vErrors.push(err164);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid0 = _errs284 === errors;
                                  if (_valid0 && valid0) {
                                    valid0 = false;
                                    passing0 = [passing0, 17];
                                  } else {
                                    if (_valid0) {
                                      valid0 = true;
                                      passing0 = 17;
                                    }
                                    const _errs292 = errors;
                                    if (errors === _errs292) {
                                      if (data && typeof data == 'object' && !Array.isArray(data)) {
                                        let missing18;
                                        if (
                                          (data.id === void 0 && (missing18 = 'id')) ||
                                          (data.type === void 0 && (missing18 = 'type'))
                                        ) {
                                          const err165 = {
                                            instancePath,
                                            schemaPath: '#/oneOf/18/required',
                                            keyword: 'required',
                                            params: { missingProperty: missing18 },
                                            message:
                                              "must have required property '" + missing18 + "'",
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err165];
                                          } else {
                                            vErrors.push(err165);
                                          }
                                          errors++;
                                        } else {
                                          if (data.id !== void 0) {
                                            const _errs294 = errors;
                                            if (typeof data.id !== 'string') {
                                              const err166 = {
                                                instancePath: instancePath + '/id',
                                                schemaPath: '#/oneOf/18/properties/id/type',
                                                keyword: 'type',
                                                params: { type: 'string' },
                                                message: 'must be string',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err166];
                                              } else {
                                                vErrors.push(err166);
                                              }
                                              errors++;
                                            }
                                            var valid45 = _errs294 === errors;
                                          } else {
                                            var valid45 = true;
                                          }
                                          if (valid45) {
                                            if (data.type !== void 0) {
                                              let data117 = data.type;
                                              const _errs296 = errors;
                                              if (typeof data117 !== 'string') {
                                                const err167 = {
                                                  instancePath: instancePath + '/type',
                                                  schemaPath: '#/oneOf/18/properties/type/type',
                                                  keyword: 'type',
                                                  params: { type: 'string' },
                                                  message: 'must be string',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err167];
                                                } else {
                                                  vErrors.push(err167);
                                                }
                                                errors++;
                                              }
                                              if (!(data117 === 'contextCompaction')) {
                                                const err168 = {
                                                  instancePath: instancePath + '/type',
                                                  schemaPath: '#/oneOf/18/properties/type/enum',
                                                  keyword: 'enum',
                                                  params: {
                                                    allowedValues:
                                                      schema45.oneOf[18].properties.type.enum,
                                                  },
                                                  message:
                                                    'must be equal to one of the allowed values',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err168];
                                                } else {
                                                  vErrors.push(err168);
                                                }
                                                errors++;
                                              }
                                              var valid45 = _errs296 === errors;
                                            } else {
                                              var valid45 = true;
                                            }
                                          }
                                        }
                                      } else {
                                        const err169 = {
                                          instancePath,
                                          schemaPath: '#/oneOf/18/type',
                                          keyword: 'type',
                                          params: { type: 'object' },
                                          message: 'must be object',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err169];
                                        } else {
                                          vErrors.push(err169);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid0 = _errs292 === errors;
                                    if (_valid0 && valid0) {
                                      valid0 = false;
                                      passing0 = [passing0, 18];
                                    } else {
                                      if (_valid0) {
                                        valid0 = true;
                                        passing0 = 18;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err170 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err170];
    } else {
      vErrors.push(err170);
    }
    errors++;
    validate98.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate98.errors = vErrors;
  return errors === 0;
}
var schema79 = {
  oneOf: [
    {
      description: '`items` was not loaded for this turn. The field is intentionally empty.',
      enum: ['notLoaded'],
      type: 'string',
    },
    {
      description: '`items` contains only a display summary for this turn.',
      enum: ['summary'],
      type: 'string',
    },
    {
      description:
        '`items` contains every ThreadItem available from persisted app-server history for this turn.',
      enum: ['full'],
      type: 'string',
    },
  ],
};
function validate174(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === 'notLoaded')) {
    const err1 = {
      instancePath,
      schemaPath: '#/oneOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema79.oneOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (typeof data !== 'string') {
    const err2 = {
      instancePath,
      schemaPath: '#/oneOf/1/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  if (!(data === 'summary')) {
    const err3 = {
      instancePath,
      schemaPath: '#/oneOf/1/enum',
      keyword: 'enum',
      params: { allowedValues: schema79.oneOf[1].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs5 = errors;
    if (typeof data !== 'string') {
      const err4 = {
        instancePath,
        schemaPath: '#/oneOf/2/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (!(data === 'full')) {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/2/enum',
        keyword: 'enum',
        params: { allowedValues: schema79.oneOf[2].enum },
        message: 'must be equal to one of the allowed values',
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    var _valid0 = _errs5 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err6 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
    validate174.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate174.errors = vErrors;
  return errors === 0;
}
var schema80 = { enum: ['completed', 'interrupted', 'failed', 'inProgress'], type: 'string' };
function validate176(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate176.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(
    data === 'completed' ||
    data === 'interrupted' ||
    data === 'failed' ||
    data === 'inProgress'
  )) {
    validate176.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema80.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate176.errors = vErrors;
  return errors === 0;
}
function validate87(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.id === void 0 && (missing0 = 'id')) ||
        (data.items === void 0 && (missing0 = 'items')) ||
        (data.status === void 0 && (missing0 = 'status'))
      ) {
        validate87.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.completedAt !== void 0) {
          let data0 = data.completedAt;
          const _errs1 = errors;
          if (!(typeof data0 == 'number' && !(data0 % 1) && !isNaN(data0)) && data0 !== null) {
            validate87.errors = [
              {
                instancePath: instancePath + '/completedAt',
                schemaPath: '#/properties/completedAt/type',
                keyword: 'type',
                params: { type: schema39.properties.completedAt.type },
                message: 'must be integer,null',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.durationMs !== void 0) {
            let data1 = data.durationMs;
            const _errs3 = errors;
            if (!(typeof data1 == 'number' && !(data1 % 1) && !isNaN(data1)) && data1 !== null) {
              validate87.errors = [
                {
                  instancePath: instancePath + '/durationMs',
                  schemaPath: '#/properties/durationMs/type',
                  keyword: 'type',
                  params: { type: schema39.properties.durationMs.type },
                  message: 'must be integer,null',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.error !== void 0) {
              let data2 = data.error;
              const _errs5 = errors;
              const _errs6 = errors;
              let valid1 = false;
              const _errs7 = errors;
              if (
                !validate88(data2, {
                  instancePath: instancePath + '/error',
                  parentData: data,
                  parentDataProperty: 'error',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
                errors = vErrors.length;
              }
              var _valid0 = _errs7 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs8 = errors;
                if (data2 !== null) {
                  const err0 = {
                    instancePath: instancePath + '/error',
                    schemaPath: '#/properties/error/anyOf/1/type',
                    keyword: 'type',
                    params: { type: 'null' },
                    message: 'must be null',
                  };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var _valid0 = _errs8 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err1 = {
                  instancePath: instancePath + '/error',
                  schemaPath: '#/properties/error/anyOf',
                  keyword: 'anyOf',
                  params: {},
                  message: 'must match a schema in anyOf',
                };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
                validate87.errors = vErrors;
                return false;
              } else {
                errors = _errs6;
                if (vErrors !== null) {
                  if (_errs6) {
                    vErrors.length = _errs6;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.id !== void 0) {
                const _errs10 = errors;
                if (typeof data.id !== 'string') {
                  validate87.errors = [
                    {
                      instancePath: instancePath + '/id',
                      schemaPath: '#/properties/id/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs10 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.items !== void 0) {
                  let data4 = data.items;
                  const _errs12 = errors;
                  if (errors === _errs12) {
                    if (Array.isArray(data4)) {
                      var valid2 = true;
                      const len0 = data4.length;
                      for (let i0 = 0; i0 < len0; i0++) {
                        const _errs14 = errors;
                        if (
                          !validate98(data4[i0], {
                            instancePath: instancePath + '/items/' + i0,
                            parentData: data4,
                            parentDataProperty: i0,
                            rootData,
                          })
                        ) {
                          vErrors =
                            vErrors === null
                              ? validate98.errors
                              : vErrors.concat(validate98.errors);
                          errors = vErrors.length;
                        }
                        var valid2 = _errs14 === errors;
                        if (!valid2) {
                          break;
                        }
                      }
                    } else {
                      validate87.errors = [
                        {
                          instancePath: instancePath + '/items',
                          schemaPath: '#/properties/items/type',
                          keyword: 'type',
                          params: { type: 'array' },
                          message: 'must be array',
                        },
                      ];
                      return false;
                    }
                  }
                  var valid0 = _errs12 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.itemsView !== void 0) {
                    const _errs15 = errors;
                    if (
                      !validate174(data.itemsView, {
                        instancePath: instancePath + '/itemsView',
                        parentData: data,
                        parentDataProperty: 'itemsView',
                        rootData,
                      })
                    ) {
                      vErrors =
                        vErrors === null ? validate174.errors : vErrors.concat(validate174.errors);
                      errors = vErrors.length;
                    }
                    var valid0 = _errs15 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.rootTurnId !== void 0) {
                      let data7 = data.rootTurnId;
                      const _errs17 = errors;
                      if (typeof data7 !== 'string' && data7 !== null) {
                        validate87.errors = [
                          {
                            instancePath: instancePath + '/rootTurnId',
                            schemaPath: '#/properties/rootTurnId/type',
                            keyword: 'type',
                            params: { type: schema39.properties.rootTurnId.type },
                            message: 'must be string,null',
                          },
                        ];
                        return false;
                      }
                      var valid0 = _errs17 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.startedAt !== void 0) {
                        let data8 = data.startedAt;
                        const _errs19 = errors;
                        if (
                          !(typeof data8 == 'number' && !(data8 % 1) && !isNaN(data8)) &&
                          data8 !== null
                        ) {
                          validate87.errors = [
                            {
                              instancePath: instancePath + '/startedAt',
                              schemaPath: '#/properties/startedAt/type',
                              keyword: 'type',
                              params: { type: schema39.properties.startedAt.type },
                              message: 'must be integer,null',
                            },
                          ];
                          return false;
                        }
                        var valid0 = _errs19 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.status !== void 0) {
                          const _errs21 = errors;
                          if (
                            !validate176(data.status, {
                              instancePath: instancePath + '/status',
                              parentData: data,
                              parentDataProperty: 'status',
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate176.errors
                                : vErrors.concat(validate176.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs21 === errors;
                        } else {
                          var valid0 = true;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate87.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate87.errors = vErrors;
  return errors === 0;
}
function validate63(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.cliVersion === void 0 && (missing0 = 'cliVersion')) ||
        (data.createdAt === void 0 && (missing0 = 'createdAt')) ||
        (data.cwd === void 0 && (missing0 = 'cwd')) ||
        (data.ephemeral === void 0 && (missing0 = 'ephemeral')) ||
        (data.id === void 0 && (missing0 = 'id')) ||
        (data.modelProvider === void 0 && (missing0 = 'modelProvider')) ||
        (data.preview === void 0 && (missing0 = 'preview')) ||
        (data.projectId === void 0 && (missing0 = 'projectId')) ||
        (data.sessionId === void 0 && (missing0 = 'sessionId')) ||
        (data.source === void 0 && (missing0 = 'source')) ||
        (data.status === void 0 && (missing0 = 'status')) ||
        (data.turns === void 0 && (missing0 = 'turns')) ||
        (data.updatedAt === void 0 && (missing0 = 'updatedAt'))
      ) {
        validate63.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.agentNickname !== void 0) {
          let data0 = data.agentNickname;
          const _errs1 = errors;
          if (typeof data0 !== 'string' && data0 !== null) {
            validate63.errors = [
              {
                instancePath: instancePath + '/agentNickname',
                schemaPath: '#/properties/agentNickname/type',
                keyword: 'type',
                params: { type: schema28.properties.agentNickname.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.agentRole !== void 0) {
            let data1 = data.agentRole;
            const _errs3 = errors;
            if (typeof data1 !== 'string' && data1 !== null) {
              validate63.errors = [
                {
                  instancePath: instancePath + '/agentRole',
                  schemaPath: '#/properties/agentRole/type',
                  keyword: 'type',
                  params: { type: schema28.properties.agentRole.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.cliVersion !== void 0) {
              const _errs5 = errors;
              if (typeof data.cliVersion !== 'string') {
                validate63.errors = [
                  {
                    instancePath: instancePath + '/cliVersion',
                    schemaPath: '#/properties/cliVersion/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.createdAt !== void 0) {
                let data3 = data.createdAt;
                const _errs7 = errors;
                if (!(typeof data3 == 'number' && !(data3 % 1) && !isNaN(data3))) {
                  validate63.errors = [
                    {
                      instancePath: instancePath + '/createdAt',
                      schemaPath: '#/properties/createdAt/type',
                      keyword: 'type',
                      params: { type: 'integer' },
                      message: 'must be integer',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.cwd !== void 0) {
                  const _errs9 = errors;
                  if (
                    !validate31(data.cwd, {
                      instancePath: instancePath + '/cwd',
                      parentData: data,
                      parentDataProperty: 'cwd',
                      rootData,
                    })
                  ) {
                    vErrors =
                      vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                    errors = vErrors.length;
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.ephemeral !== void 0) {
                    const _errs11 = errors;
                    if (typeof data.ephemeral !== 'boolean') {
                      validate63.errors = [
                        {
                          instancePath: instancePath + '/ephemeral',
                          schemaPath: '#/properties/ephemeral/type',
                          keyword: 'type',
                          params: { type: 'boolean' },
                          message: 'must be boolean',
                        },
                      ];
                      return false;
                    }
                    var valid0 = _errs11 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.forkedFromId !== void 0) {
                      let data6 = data.forkedFromId;
                      const _errs13 = errors;
                      if (typeof data6 !== 'string' && data6 !== null) {
                        validate63.errors = [
                          {
                            instancePath: instancePath + '/forkedFromId',
                            schemaPath: '#/properties/forkedFromId/type',
                            keyword: 'type',
                            params: { type: schema28.properties.forkedFromId.type },
                            message: 'must be string,null',
                          },
                        ];
                        return false;
                      }
                      var valid0 = _errs13 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.gitInfo !== void 0) {
                        let data7 = data.gitInfo;
                        const _errs15 = errors;
                        const _errs16 = errors;
                        let valid2 = false;
                        const _errs17 = errors;
                        if (
                          !validate65(data7, {
                            instancePath: instancePath + '/gitInfo',
                            parentData: data,
                            parentDataProperty: 'gitInfo',
                            rootData,
                          })
                        ) {
                          vErrors =
                            vErrors === null
                              ? validate65.errors
                              : vErrors.concat(validate65.errors);
                          errors = vErrors.length;
                        }
                        var _valid0 = _errs17 === errors;
                        valid2 = valid2 || _valid0;
                        if (!valid2) {
                          const _errs18 = errors;
                          if (data7 !== null) {
                            const err0 = {
                              instancePath: instancePath + '/gitInfo',
                              schemaPath: '#/properties/gitInfo/anyOf/1/type',
                              keyword: 'type',
                              params: { type: 'null' },
                              message: 'must be null',
                            };
                            if (vErrors === null) {
                              vErrors = [err0];
                            } else {
                              vErrors.push(err0);
                            }
                            errors++;
                          }
                          var _valid0 = _errs18 === errors;
                          valid2 = valid2 || _valid0;
                        }
                        if (!valid2) {
                          const err1 = {
                            instancePath: instancePath + '/gitInfo',
                            schemaPath: '#/properties/gitInfo/anyOf',
                            keyword: 'anyOf',
                            params: {},
                            message: 'must match a schema in anyOf',
                          };
                          if (vErrors === null) {
                            vErrors = [err1];
                          } else {
                            vErrors.push(err1);
                          }
                          errors++;
                          validate63.errors = vErrors;
                          return false;
                        } else {
                          errors = _errs16;
                          if (vErrors !== null) {
                            if (_errs16) {
                              vErrors.length = _errs16;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid0 = _errs15 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.historyMode !== void 0) {
                          const _errs20 = errors;
                          if (
                            !validate67(data.historyMode, {
                              instancePath: instancePath + '/historyMode',
                              parentData: data,
                              parentDataProperty: 'historyMode',
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate67.errors
                                : vErrors.concat(validate67.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs20 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.id !== void 0) {
                            const _errs22 = errors;
                            if (typeof data.id !== 'string') {
                              validate63.errors = [
                                {
                                  instancePath: instancePath + '/id',
                                  schemaPath: '#/properties/id/type',
                                  keyword: 'type',
                                  params: { type: 'string' },
                                  message: 'must be string',
                                },
                              ];
                              return false;
                            }
                            var valid0 = _errs22 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.model !== void 0) {
                              let data10 = data.model;
                              const _errs24 = errors;
                              if (typeof data10 !== 'string' && data10 !== null) {
                                validate63.errors = [
                                  {
                                    instancePath: instancePath + '/model',
                                    schemaPath: '#/properties/model/type',
                                    keyword: 'type',
                                    params: { type: schema28.properties.model.type },
                                    message: 'must be string,null',
                                  },
                                ];
                                return false;
                              }
                              var valid0 = _errs24 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.modelProvider !== void 0) {
                                const _errs26 = errors;
                                if (typeof data.modelProvider !== 'string') {
                                  validate63.errors = [
                                    {
                                      instancePath: instancePath + '/modelProvider',
                                      schemaPath: '#/properties/modelProvider/type',
                                      keyword: 'type',
                                      params: { type: 'string' },
                                      message: 'must be string',
                                    },
                                  ];
                                  return false;
                                }
                                var valid0 = _errs26 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.name !== void 0) {
                                  let data12 = data.name;
                                  const _errs28 = errors;
                                  if (typeof data12 !== 'string' && data12 !== null) {
                                    validate63.errors = [
                                      {
                                        instancePath: instancePath + '/name',
                                        schemaPath: '#/properties/name/type',
                                        keyword: 'type',
                                        params: { type: schema28.properties.name.type },
                                        message: 'must be string,null',
                                      },
                                    ];
                                    return false;
                                  }
                                  var valid0 = _errs28 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.originator !== void 0) {
                                    let data13 = data.originator;
                                    const _errs30 = errors;
                                    if (typeof data13 !== 'string' && data13 !== null) {
                                      validate63.errors = [
                                        {
                                          instancePath: instancePath + '/originator',
                                          schemaPath: '#/properties/originator/type',
                                          keyword: 'type',
                                          params: { type: schema28.properties.originator.type },
                                          message: 'must be string,null',
                                        },
                                      ];
                                      return false;
                                    }
                                    var valid0 = _errs30 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.parentThreadId !== void 0) {
                                      let data14 = data.parentThreadId;
                                      const _errs32 = errors;
                                      if (typeof data14 !== 'string' && data14 !== null) {
                                        validate63.errors = [
                                          {
                                            instancePath: instancePath + '/parentThreadId',
                                            schemaPath: '#/properties/parentThreadId/type',
                                            keyword: 'type',
                                            params: {
                                              type: schema28.properties.parentThreadId.type,
                                            },
                                            message: 'must be string,null',
                                          },
                                        ];
                                        return false;
                                      }
                                      var valid0 = _errs32 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.path !== void 0) {
                                        let data15 = data.path;
                                        const _errs34 = errors;
                                        if (typeof data15 !== 'string' && data15 !== null) {
                                          validate63.errors = [
                                            {
                                              instancePath: instancePath + '/path',
                                              schemaPath: '#/properties/path/type',
                                              keyword: 'type',
                                              params: { type: schema28.properties.path.type },
                                              message: 'must be string,null',
                                            },
                                          ];
                                          return false;
                                        }
                                        var valid0 = _errs34 === errors;
                                      } else {
                                        var valid0 = true;
                                      }
                                      if (valid0) {
                                        if (data.preview !== void 0) {
                                          const _errs36 = errors;
                                          if (typeof data.preview !== 'string') {
                                            validate63.errors = [
                                              {
                                                instancePath: instancePath + '/preview',
                                                schemaPath: '#/properties/preview/type',
                                                keyword: 'type',
                                                params: { type: 'string' },
                                                message: 'must be string',
                                              },
                                            ];
                                            return false;
                                          }
                                          var valid0 = _errs36 === errors;
                                        } else {
                                          var valid0 = true;
                                        }
                                        if (valid0) {
                                          if (data.projectId !== void 0) {
                                            let data17 = data.projectId;
                                            const _errs38 = errors;
                                            if (typeof data17 !== 'string' && data17 !== null) {
                                              validate63.errors = [
                                                {
                                                  instancePath: instancePath + '/projectId',
                                                  schemaPath: '#/properties/projectId/type',
                                                  keyword: 'type',
                                                  params: {
                                                    type: schema28.properties.projectId.type,
                                                  },
                                                  message: 'must be string,null',
                                                },
                                              ];
                                              return false;
                                            }
                                            var valid0 = _errs38 === errors;
                                          } else {
                                            var valid0 = true;
                                          }
                                          if (valid0) {
                                            if (data.reasoningEffort !== void 0) {
                                              let data18 = data.reasoningEffort;
                                              const _errs40 = errors;
                                              const _errs41 = errors;
                                              let valid4 = false;
                                              const _errs42 = errors;
                                              if (
                                                !validate56(data18, {
                                                  instancePath: instancePath + '/reasoningEffort',
                                                  parentData: data,
                                                  parentDataProperty: 'reasoningEffort',
                                                  rootData,
                                                })
                                              ) {
                                                vErrors =
                                                  vErrors === null
                                                    ? validate56.errors
                                                    : vErrors.concat(validate56.errors);
                                                errors = vErrors.length;
                                              }
                                              var _valid1 = _errs42 === errors;
                                              valid4 = valid4 || _valid1;
                                              if (!valid4) {
                                                const _errs43 = errors;
                                                if (data18 !== null) {
                                                  const err2 = {
                                                    instancePath: instancePath + '/reasoningEffort',
                                                    schemaPath:
                                                      '#/properties/reasoningEffort/anyOf/1/type',
                                                    keyword: 'type',
                                                    params: { type: 'null' },
                                                    message: 'must be null',
                                                  };
                                                  if (vErrors === null) {
                                                    vErrors = [err2];
                                                  } else {
                                                    vErrors.push(err2);
                                                  }
                                                  errors++;
                                                }
                                                var _valid1 = _errs43 === errors;
                                                valid4 = valid4 || _valid1;
                                              }
                                              if (!valid4) {
                                                const err3 = {
                                                  instancePath: instancePath + '/reasoningEffort',
                                                  schemaPath: '#/properties/reasoningEffort/anyOf',
                                                  keyword: 'anyOf',
                                                  params: {},
                                                  message: 'must match a schema in anyOf',
                                                };
                                                if (vErrors === null) {
                                                  vErrors = [err3];
                                                } else {
                                                  vErrors.push(err3);
                                                }
                                                errors++;
                                                validate63.errors = vErrors;
                                                return false;
                                              } else {
                                                errors = _errs41;
                                                if (vErrors !== null) {
                                                  if (_errs41) {
                                                    vErrors.length = _errs41;
                                                  } else {
                                                    vErrors = null;
                                                  }
                                                }
                                              }
                                              var valid0 = _errs40 === errors;
                                            } else {
                                              var valid0 = true;
                                            }
                                            if (valid0) {
                                              if (data.recencyAt !== void 0) {
                                                let data19 = data.recencyAt;
                                                const _errs45 = errors;
                                                if (
                                                  !(
                                                    typeof data19 == 'number' &&
                                                    !(data19 % 1) &&
                                                    !isNaN(data19)
                                                  ) &&
                                                  data19 !== null
                                                ) {
                                                  validate63.errors = [
                                                    {
                                                      instancePath: instancePath + '/recencyAt',
                                                      schemaPath: '#/properties/recencyAt/type',
                                                      keyword: 'type',
                                                      params: {
                                                        type: schema28.properties.recencyAt.type,
                                                      },
                                                      message: 'must be integer,null',
                                                    },
                                                  ];
                                                  return false;
                                                }
                                                var valid0 = _errs45 === errors;
                                              } else {
                                                var valid0 = true;
                                              }
                                              if (valid0) {
                                                if (data.section !== void 0) {
                                                  let data20 = data.section;
                                                  const _errs47 = errors;
                                                  const _errs48 = errors;
                                                  let valid5 = false;
                                                  const _errs49 = errors;
                                                  if (
                                                    !validate70(data20, {
                                                      instancePath: instancePath + '/section',
                                                      parentData: data,
                                                      parentDataProperty: 'section',
                                                      rootData,
                                                    })
                                                  ) {
                                                    vErrors =
                                                      vErrors === null
                                                        ? validate70.errors
                                                        : vErrors.concat(validate70.errors);
                                                    errors = vErrors.length;
                                                  }
                                                  var _valid2 = _errs49 === errors;
                                                  valid5 = valid5 || _valid2;
                                                  if (!valid5) {
                                                    const _errs50 = errors;
                                                    if (data20 !== null) {
                                                      const err4 = {
                                                        instancePath: instancePath + '/section',
                                                        schemaPath:
                                                          '#/properties/section/anyOf/1/type',
                                                        keyword: 'type',
                                                        params: { type: 'null' },
                                                        message: 'must be null',
                                                      };
                                                      if (vErrors === null) {
                                                        vErrors = [err4];
                                                      } else {
                                                        vErrors.push(err4);
                                                      }
                                                      errors++;
                                                    }
                                                    var _valid2 = _errs50 === errors;
                                                    valid5 = valid5 || _valid2;
                                                  }
                                                  if (!valid5) {
                                                    const err5 = {
                                                      instancePath: instancePath + '/section',
                                                      schemaPath: '#/properties/section/anyOf',
                                                      keyword: 'anyOf',
                                                      params: {},
                                                      message: 'must match a schema in anyOf',
                                                    };
                                                    if (vErrors === null) {
                                                      vErrors = [err5];
                                                    } else {
                                                      vErrors.push(err5);
                                                    }
                                                    errors++;
                                                    validate63.errors = vErrors;
                                                    return false;
                                                  } else {
                                                    errors = _errs48;
                                                    if (vErrors !== null) {
                                                      if (_errs48) {
                                                        vErrors.length = _errs48;
                                                      } else {
                                                        vErrors = null;
                                                      }
                                                    }
                                                  }
                                                  var valid0 = _errs47 === errors;
                                                } else {
                                                  var valid0 = true;
                                                }
                                                if (valid0) {
                                                  if (data.sectionEnteredAt !== void 0) {
                                                    let data21 = data.sectionEnteredAt;
                                                    const _errs52 = errors;
                                                    if (
                                                      !(
                                                        typeof data21 == 'number' &&
                                                        !(data21 % 1) &&
                                                        !isNaN(data21)
                                                      ) &&
                                                      data21 !== null
                                                    ) {
                                                      validate63.errors = [
                                                        {
                                                          instancePath:
                                                            instancePath + '/sectionEnteredAt',
                                                          schemaPath:
                                                            '#/properties/sectionEnteredAt/type',
                                                          keyword: 'type',
                                                          params: {
                                                            type: schema28.properties
                                                              .sectionEnteredAt.type,
                                                          },
                                                          message: 'must be integer,null',
                                                        },
                                                      ];
                                                      return false;
                                                    }
                                                    var valid0 = _errs52 === errors;
                                                  } else {
                                                    var valid0 = true;
                                                  }
                                                  if (valid0) {
                                                    if (data.sessionId !== void 0) {
                                                      const _errs54 = errors;
                                                      if (typeof data.sessionId !== 'string') {
                                                        validate63.errors = [
                                                          {
                                                            instancePath:
                                                              instancePath + '/sessionId',
                                                            schemaPath:
                                                              '#/properties/sessionId/type',
                                                            keyword: 'type',
                                                            params: { type: 'string' },
                                                            message: 'must be string',
                                                          },
                                                        ];
                                                        return false;
                                                      }
                                                      var valid0 = _errs54 === errors;
                                                    } else {
                                                      var valid0 = true;
                                                    }
                                                    if (valid0) {
                                                      if (data.source !== void 0) {
                                                        const _errs56 = errors;
                                                        if (
                                                          !validate74(data.source, {
                                                            instancePath: instancePath + '/source',
                                                            parentData: data,
                                                            parentDataProperty: 'source',
                                                            rootData,
                                                          })
                                                        ) {
                                                          vErrors =
                                                            vErrors === null
                                                              ? validate74.errors
                                                              : vErrors.concat(validate74.errors);
                                                          errors = vErrors.length;
                                                        }
                                                        var valid0 = _errs56 === errors;
                                                      } else {
                                                        var valid0 = true;
                                                      }
                                                      if (valid0) {
                                                        if (data.status !== void 0) {
                                                          const _errs58 = errors;
                                                          if (
                                                            !validate82(data.status, {
                                                              instancePath:
                                                                instancePath + '/status',
                                                              parentData: data,
                                                              parentDataProperty: 'status',
                                                              rootData,
                                                            })
                                                          ) {
                                                            vErrors =
                                                              vErrors === null
                                                                ? validate82.errors
                                                                : vErrors.concat(validate82.errors);
                                                            errors = vErrors.length;
                                                          }
                                                          var valid0 = _errs58 === errors;
                                                        } else {
                                                          var valid0 = true;
                                                        }
                                                        if (valid0) {
                                                          if (data.threadSource !== void 0) {
                                                            let data25 = data.threadSource;
                                                            const _errs60 = errors;
                                                            const _errs61 = errors;
                                                            let valid8 = false;
                                                            const _errs62 = errors;
                                                            if (
                                                              !validate46(data25, {
                                                                instancePath:
                                                                  instancePath + '/threadSource',
                                                                parentData: data,
                                                                parentDataProperty: 'threadSource',
                                                                rootData,
                                                              })
                                                            ) {
                                                              vErrors =
                                                                vErrors === null
                                                                  ? validate46.errors
                                                                  : vErrors.concat(
                                                                      validate46.errors,
                                                                    );
                                                              errors = vErrors.length;
                                                            }
                                                            var _valid3 = _errs62 === errors;
                                                            valid8 = valid8 || _valid3;
                                                            if (!valid8) {
                                                              const _errs63 = errors;
                                                              if (data25 !== null) {
                                                                const err6 = {
                                                                  instancePath:
                                                                    instancePath + '/threadSource',
                                                                  schemaPath:
                                                                    '#/properties/threadSource/anyOf/1/type',
                                                                  keyword: 'type',
                                                                  params: { type: 'null' },
                                                                  message: 'must be null',
                                                                };
                                                                if (vErrors === null) {
                                                                  vErrors = [err6];
                                                                } else {
                                                                  vErrors.push(err6);
                                                                }
                                                                errors++;
                                                              }
                                                              var _valid3 = _errs63 === errors;
                                                              valid8 = valid8 || _valid3;
                                                            }
                                                            if (!valid8) {
                                                              const err7 = {
                                                                instancePath:
                                                                  instancePath + '/threadSource',
                                                                schemaPath:
                                                                  '#/properties/threadSource/anyOf',
                                                                keyword: 'anyOf',
                                                                params: {},
                                                                message:
                                                                  'must match a schema in anyOf',
                                                              };
                                                              if (vErrors === null) {
                                                                vErrors = [err7];
                                                              } else {
                                                                vErrors.push(err7);
                                                              }
                                                              errors++;
                                                              validate63.errors = vErrors;
                                                              return false;
                                                            } else {
                                                              errors = _errs61;
                                                              if (vErrors !== null) {
                                                                if (_errs61) {
                                                                  vErrors.length = _errs61;
                                                                } else {
                                                                  vErrors = null;
                                                                }
                                                              }
                                                            }
                                                            var valid0 = _errs60 === errors;
                                                          } else {
                                                            var valid0 = true;
                                                          }
                                                          if (valid0) {
                                                            if (data.turns !== void 0) {
                                                              let data26 = data.turns;
                                                              const _errs65 = errors;
                                                              if (errors === _errs65) {
                                                                if (Array.isArray(data26)) {
                                                                  var valid9 = true;
                                                                  const len0 = data26.length;
                                                                  for (
                                                                    let i0 = 0;
                                                                    i0 < len0;
                                                                    i0++
                                                                  ) {
                                                                    const _errs67 = errors;
                                                                    if (
                                                                      !validate87(data26[i0], {
                                                                        instancePath:
                                                                          instancePath +
                                                                          '/turns/' +
                                                                          i0,
                                                                        parentData: data26,
                                                                        parentDataProperty: i0,
                                                                        rootData,
                                                                      })
                                                                    ) {
                                                                      vErrors =
                                                                        vErrors === null
                                                                          ? validate87.errors
                                                                          : vErrors.concat(
                                                                              validate87.errors,
                                                                            );
                                                                      errors = vErrors.length;
                                                                    }
                                                                    var valid9 = _errs67 === errors;
                                                                    if (!valid9) {
                                                                      break;
                                                                    }
                                                                  }
                                                                } else {
                                                                  validate63.errors = [
                                                                    {
                                                                      instancePath:
                                                                        instancePath + '/turns',
                                                                      schemaPath:
                                                                        '#/properties/turns/type',
                                                                      keyword: 'type',
                                                                      params: { type: 'array' },
                                                                      message: 'must be array',
                                                                    },
                                                                  ];
                                                                  return false;
                                                                }
                                                              }
                                                              var valid0 = _errs65 === errors;
                                                            } else {
                                                              var valid0 = true;
                                                            }
                                                            if (valid0) {
                                                              if (data.updatedAt !== void 0) {
                                                                let data28 = data.updatedAt;
                                                                const _errs68 = errors;
                                                                if (!(
                                                                  typeof data28 == 'number' &&
                                                                  !(data28 % 1) &&
                                                                  !isNaN(data28)
                                                                )) {
                                                                  validate63.errors = [
                                                                    {
                                                                      instancePath:
                                                                        instancePath + '/updatedAt',
                                                                      schemaPath:
                                                                        '#/properties/updatedAt/type',
                                                                      keyword: 'type',
                                                                      params: { type: 'integer' },
                                                                      message: 'must be integer',
                                                                    },
                                                                  ];
                                                                  return false;
                                                                }
                                                                var valid0 = _errs68 === errors;
                                                              } else {
                                                                var valid0 = true;
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate63.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate63.errors = vErrors;
  return errors === 0;
}
function validate50(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.approvalPolicy === void 0 && (missing0 = 'approvalPolicy')) ||
        (data.approvalsReviewer === void 0 && (missing0 = 'approvalsReviewer')) ||
        (data.cwd === void 0 && (missing0 = 'cwd')) ||
        (data.model === void 0 && (missing0 = 'model')) ||
        (data.modelProvider === void 0 && (missing0 = 'modelProvider')) ||
        (data.sandbox === void 0 && (missing0 = 'sandbox')) ||
        (data.thread === void 0 && (missing0 = 'thread'))
      ) {
        validate50.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.approvalPolicy !== void 0) {
          const _errs1 = errors;
          if (
            !validate36(data.approvalPolicy, {
              instancePath: instancePath + '/approvalPolicy',
              parentData: data,
              parentDataProperty: 'approvalPolicy',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.approvalsReviewer !== void 0) {
            const _errs2 = errors;
            if (
              !validate38(data.approvalsReviewer, {
                instancePath: instancePath + '/approvalsReviewer',
                parentData: data,
                parentDataProperty: 'approvalsReviewer',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.cwd !== void 0) {
              const _errs4 = errors;
              if (
                !validate31(data.cwd, {
                  instancePath: instancePath + '/cwd',
                  parentData: data,
                  parentDataProperty: 'cwd',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                errors = vErrors.length;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.disabledPluginIds !== void 0) {
                let data3 = data.disabledPluginIds;
                const _errs5 = errors;
                if (errors === _errs5) {
                  if (Array.isArray(data3)) {
                    var valid2 = true;
                    const len0 = data3.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      const _errs7 = errors;
                      if (typeof data3[i0] !== 'string') {
                        validate50.errors = [
                          {
                            instancePath: instancePath + '/disabledPluginIds/' + i0,
                            schemaPath: '#/properties/disabledPluginIds/items/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          },
                        ];
                        return false;
                      }
                      var valid2 = _errs7 === errors;
                      if (!valid2) {
                        break;
                      }
                    }
                  } else {
                    validate50.errors = [
                      {
                        instancePath: instancePath + '/disabledPluginIds',
                        schemaPath: '#/properties/disabledPluginIds/type',
                        keyword: 'type',
                        params: { type: 'array' },
                        message: 'must be array',
                      },
                    ];
                    return false;
                  }
                }
                var valid0 = _errs5 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.instructionSources !== void 0) {
                  let data5 = data.instructionSources;
                  const _errs9 = errors;
                  if (errors === _errs9) {
                    if (Array.isArray(data5)) {
                      var valid3 = true;
                      const len1 = data5.length;
                      for (let i1 = 0; i1 < len1; i1++) {
                        const _errs11 = errors;
                        if (
                          !validate54(data5[i1], {
                            instancePath: instancePath + '/instructionSources/' + i1,
                            parentData: data5,
                            parentDataProperty: i1,
                            rootData,
                          })
                        ) {
                          vErrors =
                            vErrors === null
                              ? validate54.errors
                              : vErrors.concat(validate54.errors);
                          errors = vErrors.length;
                        }
                        var valid3 = _errs11 === errors;
                        if (!valid3) {
                          break;
                        }
                      }
                    } else {
                      validate50.errors = [
                        {
                          instancePath: instancePath + '/instructionSources',
                          schemaPath: '#/properties/instructionSources/type',
                          keyword: 'type',
                          params: { type: 'array' },
                          message: 'must be array',
                        },
                      ];
                      return false;
                    }
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.model !== void 0) {
                    const _errs12 = errors;
                    if (typeof data.model !== 'string') {
                      validate50.errors = [
                        {
                          instancePath: instancePath + '/model',
                          schemaPath: '#/properties/model/type',
                          keyword: 'type',
                          params: { type: 'string' },
                          message: 'must be string',
                        },
                      ];
                      return false;
                    }
                    var valid0 = _errs12 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.modelProvider !== void 0) {
                      const _errs14 = errors;
                      if (typeof data.modelProvider !== 'string') {
                        validate50.errors = [
                          {
                            instancePath: instancePath + '/modelProvider',
                            schemaPath: '#/properties/modelProvider/type',
                            keyword: 'type',
                            params: { type: 'string' },
                            message: 'must be string',
                          },
                        ];
                        return false;
                      }
                      var valid0 = _errs14 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.reasoningEffort !== void 0) {
                        let data9 = data.reasoningEffort;
                        const _errs16 = errors;
                        const _errs17 = errors;
                        let valid4 = false;
                        const _errs18 = errors;
                        if (
                          !validate56(data9, {
                            instancePath: instancePath + '/reasoningEffort',
                            parentData: data,
                            parentDataProperty: 'reasoningEffort',
                            rootData,
                          })
                        ) {
                          vErrors =
                            vErrors === null
                              ? validate56.errors
                              : vErrors.concat(validate56.errors);
                          errors = vErrors.length;
                        }
                        var _valid0 = _errs18 === errors;
                        valid4 = valid4 || _valid0;
                        if (!valid4) {
                          const _errs19 = errors;
                          if (data9 !== null) {
                            const err0 = {
                              instancePath: instancePath + '/reasoningEffort',
                              schemaPath: '#/properties/reasoningEffort/anyOf/1/type',
                              keyword: 'type',
                              params: { type: 'null' },
                              message: 'must be null',
                            };
                            if (vErrors === null) {
                              vErrors = [err0];
                            } else {
                              vErrors.push(err0);
                            }
                            errors++;
                          }
                          var _valid0 = _errs19 === errors;
                          valid4 = valid4 || _valid0;
                        }
                        if (!valid4) {
                          const err1 = {
                            instancePath: instancePath + '/reasoningEffort',
                            schemaPath: '#/properties/reasoningEffort/anyOf',
                            keyword: 'anyOf',
                            params: {},
                            message: 'must match a schema in anyOf',
                          };
                          if (vErrors === null) {
                            vErrors = [err1];
                          } else {
                            vErrors.push(err1);
                          }
                          errors++;
                          validate50.errors = vErrors;
                          return false;
                        } else {
                          errors = _errs17;
                          if (vErrors !== null) {
                            if (_errs17) {
                              vErrors.length = _errs17;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid0 = _errs16 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.sandbox !== void 0) {
                          const _errs21 = errors;
                          if (
                            !validate58(data.sandbox, {
                              instancePath: instancePath + '/sandbox',
                              parentData: data,
                              parentDataProperty: 'sandbox',
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate58.errors
                                : vErrors.concat(validate58.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs21 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.serviceTier !== void 0) {
                            let data11 = data.serviceTier;
                            const _errs23 = errors;
                            if (typeof data11 !== 'string' && data11 !== null) {
                              validate50.errors = [
                                {
                                  instancePath: instancePath + '/serviceTier',
                                  schemaPath: '#/properties/serviceTier/type',
                                  keyword: 'type',
                                  params: { type: schema23.properties.serviceTier.type },
                                  message: 'must be string,null',
                                },
                              ];
                              return false;
                            }
                            var valid0 = _errs23 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.thread !== void 0) {
                              const _errs25 = errors;
                              if (
                                !validate63(data.thread, {
                                  instancePath: instancePath + '/thread',
                                  parentData: data,
                                  parentDataProperty: 'thread',
                                  rootData,
                                })
                              ) {
                                vErrors =
                                  vErrors === null
                                    ? validate63.errors
                                    : vErrors.concat(validate63.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs25 === errors;
                            } else {
                              var valid0 = true;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate50.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate50.errors = vErrors;
  return errors === 0;
}
function validate49(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate50(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
    errors = vErrors.length;
  }
  validate49.errors = vErrors;
  return errors === 0;
}
var request2Params = validate181;
var schema82 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  description:
    'There are three ways to resume a thread: 1. By thread_id: load the thread from disk by thread_id and resume it. 2. By history: instantiate the thread from memory and resume it. 3. By path: load the thread from disk by path and resume it.\n\nFor non-running threads, the precedence is: history > non-empty path > thread_id. If using history or a non-empty path for a non-running thread, the thread_id param will be ignored.\n\nIf thread_id identifies a running thread, app-server rejoins that thread and treats a non-empty path as a consistency check against the active rollout path. Empty string path values are treated as absent.\n\nPrefer using thread_id whenever possible.',
  properties: {
    approvalPolicy: { anyOf: [{ $ref: '#/definitions/v2/AskForApproval' }, { type: 'null' }] },
    approvalsReviewer: {
      anyOf: [{ $ref: '#/definitions/v2/ApprovalsReviewer' }, { type: 'null' }],
      description:
        'Override where approval requests are routed for review on this thread and subsequent turns.',
    },
    baseInstructions: { type: ['string', 'null'] },
    config: { additionalProperties: true, type: ['object', 'null'] },
    cwd: { type: ['string', 'null'] },
    developerInstructions: { type: ['string', 'null'] },
    excludeTurns: {
      description:
        'When true, return only thread metadata and live-resume state without populating `thread.turns`. This is useful when the client plans to call `thread/turns/list` immediately after resuming. Full-history hydration is deprecated for paginated threads; use this with `thread/turns/list` and `thread/items/list` instead.',
      type: 'boolean',
    },
    model: {
      description: 'Configuration overrides for the resumed thread, if any.',
      type: ['string', 'null'],
    },
    modelProvider: { type: ['string', 'null'] },
    personality: {
      anyOf: [{ $ref: '#/definitions/v2/Personality' }, { type: 'null' }],
      description:
        "@deprecated `friendly` and `pragmatic` no longer select a style. Changing this does not rewrite the thread's existing instructions.",
    },
    sandbox: { anyOf: [{ $ref: '#/definitions/v2/SandboxMode' }, { type: 'null' }] },
    serviceTier: { type: ['string', 'null'] },
    threadId: { type: 'string' },
  },
  required: ['threadId'],
  title: 'ThreadResumeParams',
  type: 'object',
};
function validate182(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = 'threadId')) {
        validate182.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.approvalPolicy !== void 0) {
          let data0 = data.approvalPolicy;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          if (
            !validate36(data0, {
              instancePath: instancePath + '/approvalPolicy',
              parentData: data,
              parentDataProperty: 'approvalPolicy',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs4 = errors;
            if (data0 !== null) {
              const err0 = {
                instancePath: instancePath + '/approvalPolicy',
                schemaPath: '#/properties/approvalPolicy/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
            var _valid0 = _errs4 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err1 = {
              instancePath: instancePath + '/approvalPolicy',
              schemaPath: '#/properties/approvalPolicy/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate182.errors = vErrors;
            return false;
          } else {
            errors = _errs2;
            if (vErrors !== null) {
              if (_errs2) {
                vErrors.length = _errs2;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.approvalsReviewer !== void 0) {
            let data1 = data.approvalsReviewer;
            const _errs6 = errors;
            const _errs7 = errors;
            let valid2 = false;
            const _errs8 = errors;
            if (
              !validate38(data1, {
                instancePath: instancePath + '/approvalsReviewer',
                parentData: data,
                parentDataProperty: 'approvalsReviewer',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
              errors = vErrors.length;
            }
            var _valid1 = _errs8 === errors;
            valid2 = valid2 || _valid1;
            if (!valid2) {
              const _errs9 = errors;
              if (data1 !== null) {
                const err2 = {
                  instancePath: instancePath + '/approvalsReviewer',
                  schemaPath: '#/properties/approvalsReviewer/anyOf/1/type',
                  keyword: 'type',
                  params: { type: 'null' },
                  message: 'must be null',
                };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
              var _valid1 = _errs9 === errors;
              valid2 = valid2 || _valid1;
            }
            if (!valid2) {
              const err3 = {
                instancePath: instancePath + '/approvalsReviewer',
                schemaPath: '#/properties/approvalsReviewer/anyOf',
                keyword: 'anyOf',
                params: {},
                message: 'must match a schema in anyOf',
              };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
              validate182.errors = vErrors;
              return false;
            } else {
              errors = _errs7;
              if (vErrors !== null) {
                if (_errs7) {
                  vErrors.length = _errs7;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid0 = _errs6 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.baseInstructions !== void 0) {
              let data2 = data.baseInstructions;
              const _errs11 = errors;
              if (typeof data2 !== 'string' && data2 !== null) {
                validate182.errors = [
                  {
                    instancePath: instancePath + '/baseInstructions',
                    schemaPath: '#/properties/baseInstructions/type',
                    keyword: 'type',
                    params: { type: schema82.properties.baseInstructions.type },
                    message: 'must be string,null',
                  },
                ];
                return false;
              }
              var valid0 = _errs11 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.config !== void 0) {
                let data3 = data.config;
                const _errs13 = errors;
                if (
                  !(data3 && typeof data3 == 'object' && !Array.isArray(data3)) &&
                  data3 !== null
                ) {
                  validate182.errors = [
                    {
                      instancePath: instancePath + '/config',
                      schemaPath: '#/properties/config/type',
                      keyword: 'type',
                      params: { type: schema82.properties.config.type },
                      message: 'must be object,null',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs13 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.cwd !== void 0) {
                  let data4 = data.cwd;
                  const _errs16 = errors;
                  if (typeof data4 !== 'string' && data4 !== null) {
                    validate182.errors = [
                      {
                        instancePath: instancePath + '/cwd',
                        schemaPath: '#/properties/cwd/type',
                        keyword: 'type',
                        params: { type: schema82.properties.cwd.type },
                        message: 'must be string,null',
                      },
                    ];
                    return false;
                  }
                  var valid0 = _errs16 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.developerInstructions !== void 0) {
                    let data5 = data.developerInstructions;
                    const _errs18 = errors;
                    if (typeof data5 !== 'string' && data5 !== null) {
                      validate182.errors = [
                        {
                          instancePath: instancePath + '/developerInstructions',
                          schemaPath: '#/properties/developerInstructions/type',
                          keyword: 'type',
                          params: { type: schema82.properties.developerInstructions.type },
                          message: 'must be string,null',
                        },
                      ];
                      return false;
                    }
                    var valid0 = _errs18 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.excludeTurns !== void 0) {
                      const _errs20 = errors;
                      if (typeof data.excludeTurns !== 'boolean') {
                        validate182.errors = [
                          {
                            instancePath: instancePath + '/excludeTurns',
                            schemaPath: '#/properties/excludeTurns/type',
                            keyword: 'type',
                            params: { type: 'boolean' },
                            message: 'must be boolean',
                          },
                        ];
                        return false;
                      }
                      var valid0 = _errs20 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.model !== void 0) {
                        let data7 = data.model;
                        const _errs22 = errors;
                        if (typeof data7 !== 'string' && data7 !== null) {
                          validate182.errors = [
                            {
                              instancePath: instancePath + '/model',
                              schemaPath: '#/properties/model/type',
                              keyword: 'type',
                              params: { type: schema82.properties.model.type },
                              message: 'must be string,null',
                            },
                          ];
                          return false;
                        }
                        var valid0 = _errs22 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.modelProvider !== void 0) {
                          let data8 = data.modelProvider;
                          const _errs24 = errors;
                          if (typeof data8 !== 'string' && data8 !== null) {
                            validate182.errors = [
                              {
                                instancePath: instancePath + '/modelProvider',
                                schemaPath: '#/properties/modelProvider/type',
                                keyword: 'type',
                                params: { type: schema82.properties.modelProvider.type },
                                message: 'must be string,null',
                              },
                            ];
                            return false;
                          }
                          var valid0 = _errs24 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.personality !== void 0) {
                            let data9 = data.personality;
                            const _errs26 = errors;
                            const _errs27 = errors;
                            let valid3 = false;
                            const _errs28 = errors;
                            if (
                              !validate40(data9, {
                                instancePath: instancePath + '/personality',
                                parentData: data,
                                parentDataProperty: 'personality',
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate40.errors
                                  : vErrors.concat(validate40.errors);
                              errors = vErrors.length;
                            }
                            var _valid2 = _errs28 === errors;
                            valid3 = valid3 || _valid2;
                            if (!valid3) {
                              const _errs29 = errors;
                              if (data9 !== null) {
                                const err4 = {
                                  instancePath: instancePath + '/personality',
                                  schemaPath: '#/properties/personality/anyOf/1/type',
                                  keyword: 'type',
                                  params: { type: 'null' },
                                  message: 'must be null',
                                };
                                if (vErrors === null) {
                                  vErrors = [err4];
                                } else {
                                  vErrors.push(err4);
                                }
                                errors++;
                              }
                              var _valid2 = _errs29 === errors;
                              valid3 = valid3 || _valid2;
                            }
                            if (!valid3) {
                              const err5 = {
                                instancePath: instancePath + '/personality',
                                schemaPath: '#/properties/personality/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                              };
                              if (vErrors === null) {
                                vErrors = [err5];
                              } else {
                                vErrors.push(err5);
                              }
                              errors++;
                              validate182.errors = vErrors;
                              return false;
                            } else {
                              errors = _errs27;
                              if (vErrors !== null) {
                                if (_errs27) {
                                  vErrors.length = _errs27;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid0 = _errs26 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.sandbox !== void 0) {
                              let data10 = data.sandbox;
                              const _errs31 = errors;
                              const _errs32 = errors;
                              let valid4 = false;
                              const _errs33 = errors;
                              if (
                                !validate42(data10, {
                                  instancePath: instancePath + '/sandbox',
                                  parentData: data,
                                  parentDataProperty: 'sandbox',
                                  rootData,
                                })
                              ) {
                                vErrors =
                                  vErrors === null
                                    ? validate42.errors
                                    : vErrors.concat(validate42.errors);
                                errors = vErrors.length;
                              }
                              var _valid3 = _errs33 === errors;
                              valid4 = valid4 || _valid3;
                              if (!valid4) {
                                const _errs34 = errors;
                                if (data10 !== null) {
                                  const err6 = {
                                    instancePath: instancePath + '/sandbox',
                                    schemaPath: '#/properties/sandbox/anyOf/1/type',
                                    keyword: 'type',
                                    params: { type: 'null' },
                                    message: 'must be null',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err6];
                                  } else {
                                    vErrors.push(err6);
                                  }
                                  errors++;
                                }
                                var _valid3 = _errs34 === errors;
                                valid4 = valid4 || _valid3;
                              }
                              if (!valid4) {
                                const err7 = {
                                  instancePath: instancePath + '/sandbox',
                                  schemaPath: '#/properties/sandbox/anyOf',
                                  keyword: 'anyOf',
                                  params: {},
                                  message: 'must match a schema in anyOf',
                                };
                                if (vErrors === null) {
                                  vErrors = [err7];
                                } else {
                                  vErrors.push(err7);
                                }
                                errors++;
                                validate182.errors = vErrors;
                                return false;
                              } else {
                                errors = _errs32;
                                if (vErrors !== null) {
                                  if (_errs32) {
                                    vErrors.length = _errs32;
                                  } else {
                                    vErrors = null;
                                  }
                                }
                              }
                              var valid0 = _errs31 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.serviceTier !== void 0) {
                                let data11 = data.serviceTier;
                                const _errs36 = errors;
                                if (typeof data11 !== 'string' && data11 !== null) {
                                  validate182.errors = [
                                    {
                                      instancePath: instancePath + '/serviceTier',
                                      schemaPath: '#/properties/serviceTier/type',
                                      keyword: 'type',
                                      params: { type: schema82.properties.serviceTier.type },
                                      message: 'must be string,null',
                                    },
                                  ];
                                  return false;
                                }
                                var valid0 = _errs36 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.threadId !== void 0) {
                                  const _errs38 = errors;
                                  if (typeof data.threadId !== 'string') {
                                    validate182.errors = [
                                      {
                                        instancePath: instancePath + '/threadId',
                                        schemaPath: '#/properties/threadId/type',
                                        keyword: 'type',
                                        params: { type: 'string' },
                                        message: 'must be string',
                                      },
                                    ];
                                    return false;
                                  }
                                  var valid0 = _errs38 === errors;
                                } else {
                                  var valid0 = true;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate182.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate182.errors = vErrors;
  return errors === 0;
}
function validate181(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate182(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate182.errors : vErrors.concat(validate182.errors);
    errors = vErrors.length;
  }
  validate181.errors = vErrors;
  return errors === 0;
}
var request2Result = validate188;
var schema84 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    approvalPolicy: { $ref: '#/definitions/v2/AskForApproval' },
    approvalsReviewer: {
      allOf: [{ $ref: '#/definitions/v2/ApprovalsReviewer' }],
      description: 'Reviewer currently used for approval requests on this thread.',
    },
    collaborationMode: {
      anyOf: [{ $ref: '#/definitions/v2/CollaborationMode' }, { type: 'null' }],
      description: 'Effective collaboration mode. Absent when resuming from an older server.',
    },
    cwd: { $ref: '#/definitions/v2/AbsolutePathBuf' },
    disabledPluginIds: {
      default: [],
      description: 'Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.',
      items: { type: 'string' },
      type: 'array',
    },
    instructionSources: {
      default: [],
      description:
        'Environment-native paths to instruction source files currently loaded for this thread.',
      items: { $ref: '#/definitions/v2/LegacyAppPathString' },
      type: 'array',
    },
    itemsBackwardsCursor: {
      default: null,
      description:
        'Opaque cursor for hydrating paginated items backwards.\n\nPass this as `cursor` to `thread/items/list` with `sortDirection: "desc"`. The first page includes the item identified by the cursor.',
      type: ['string', 'null'],
    },
    model: { type: 'string' },
    modelProvider: { type: 'string' },
    reasoningEffort: { anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }] },
    sandbox: {
      allOf: [{ $ref: '#/definitions/v2/SandboxPolicy' }],
      description:
        'Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance.',
    },
    serviceTier: { type: ['string', 'null'] },
    thread: { $ref: '#/definitions/v2/Thread' },
    turnsBackwardsCursor: {
      default: null,
      description:
        'Opaque cursor for hydrating paginated turns backwards.\n\nPass this as `cursor` to `thread/turns/list` with `sortDirection: "desc"`. The first page includes the turn identified by the cursor.',
      type: ['string', 'null'],
    },
  },
  required: [
    'approvalPolicy',
    'approvalsReviewer',
    'cwd',
    'model',
    'modelProvider',
    'sandbox',
    'thread',
  ],
  title: 'ThreadResumeResponse',
  type: 'object',
};
var schema86 = {
  description: 'Initial collaboration mode to use when the TUI starts.',
  enum: ['plan', 'default'],
  type: 'string',
};
function validate193(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data !== 'string') {
    validate193.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ];
    return false;
  }
  if (!(data === 'plan' || data === 'default')) {
    validate193.errors = [
      {
        instancePath,
        schemaPath: '#/enum',
        keyword: 'enum',
        params: { allowedValues: schema86.enum },
        message: 'must be equal to one of the allowed values',
      },
    ];
    return false;
  }
  validate193.errors = vErrors;
  return errors === 0;
}
var schema87 = {
  description: 'Settings for a collaboration mode.',
  properties: {
    developer_instructions: { type: ['string', 'null'] },
    model: { type: 'string' },
    reasoning_effort: { anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }] },
  },
  required: ['model'],
  type: 'object',
};
function validate195(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.model === void 0 && (missing0 = 'model')) {
        validate195.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.developer_instructions !== void 0) {
          let data0 = data.developer_instructions;
          const _errs1 = errors;
          if (typeof data0 !== 'string' && data0 !== null) {
            validate195.errors = [
              {
                instancePath: instancePath + '/developer_instructions',
                schemaPath: '#/properties/developer_instructions/type',
                keyword: 'type',
                params: { type: schema87.properties.developer_instructions.type },
                message: 'must be string,null',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.model !== void 0) {
            const _errs3 = errors;
            if (typeof data.model !== 'string') {
              validate195.errors = [
                {
                  instancePath: instancePath + '/model',
                  schemaPath: '#/properties/model/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.reasoning_effort !== void 0) {
              let data2 = data.reasoning_effort;
              const _errs5 = errors;
              const _errs6 = errors;
              let valid1 = false;
              const _errs7 = errors;
              if (
                !validate56(data2, {
                  instancePath: instancePath + '/reasoning_effort',
                  parentData: data,
                  parentDataProperty: 'reasoning_effort',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
                errors = vErrors.length;
              }
              var _valid0 = _errs7 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs8 = errors;
                if (data2 !== null) {
                  const err0 = {
                    instancePath: instancePath + '/reasoning_effort',
                    schemaPath: '#/properties/reasoning_effort/anyOf/1/type',
                    keyword: 'type',
                    params: { type: 'null' },
                    message: 'must be null',
                  };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var _valid0 = _errs8 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err1 = {
                  instancePath: instancePath + '/reasoning_effort',
                  schemaPath: '#/properties/reasoning_effort/anyOf',
                  keyword: 'anyOf',
                  params: {},
                  message: 'must match a schema in anyOf',
                };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
                validate195.errors = vErrors;
                return false;
              } else {
                errors = _errs6;
                if (vErrors !== null) {
                  if (_errs6) {
                    vErrors.length = _errs6;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate195.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate195.errors = vErrors;
  return errors === 0;
}
function validate192(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.mode === void 0 && (missing0 = 'mode')) ||
        (data.settings === void 0 && (missing0 = 'settings'))
      ) {
        validate192.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.mode !== void 0) {
          const _errs1 = errors;
          if (
            !validate193(data.mode, {
              instancePath: instancePath + '/mode',
              parentData: data,
              parentDataProperty: 'mode',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate193.errors : vErrors.concat(validate193.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.settings !== void 0) {
            const _errs2 = errors;
            if (
              !validate195(data.settings, {
                instancePath: instancePath + '/settings',
                parentData: data,
                parentDataProperty: 'settings',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate195.errors : vErrors.concat(validate195.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate192.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate192.errors = vErrors;
  return errors === 0;
}
function validate189(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.approvalPolicy === void 0 && (missing0 = 'approvalPolicy')) ||
        (data.approvalsReviewer === void 0 && (missing0 = 'approvalsReviewer')) ||
        (data.cwd === void 0 && (missing0 = 'cwd')) ||
        (data.model === void 0 && (missing0 = 'model')) ||
        (data.modelProvider === void 0 && (missing0 = 'modelProvider')) ||
        (data.sandbox === void 0 && (missing0 = 'sandbox')) ||
        (data.thread === void 0 && (missing0 = 'thread'))
      ) {
        validate189.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.approvalPolicy !== void 0) {
          const _errs1 = errors;
          if (
            !validate36(data.approvalPolicy, {
              instancePath: instancePath + '/approvalPolicy',
              parentData: data,
              parentDataProperty: 'approvalPolicy',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.approvalsReviewer !== void 0) {
            const _errs2 = errors;
            if (
              !validate38(data.approvalsReviewer, {
                instancePath: instancePath + '/approvalsReviewer',
                parentData: data,
                parentDataProperty: 'approvalsReviewer',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.collaborationMode !== void 0) {
              let data2 = data.collaborationMode;
              const _errs4 = errors;
              const _errs5 = errors;
              let valid2 = false;
              const _errs6 = errors;
              if (
                !validate192(data2, {
                  instancePath: instancePath + '/collaborationMode',
                  parentData: data,
                  parentDataProperty: 'collaborationMode',
                  rootData,
                })
              ) {
                vErrors =
                  vErrors === null ? validate192.errors : vErrors.concat(validate192.errors);
                errors = vErrors.length;
              }
              var _valid0 = _errs6 === errors;
              valid2 = valid2 || _valid0;
              if (!valid2) {
                const _errs7 = errors;
                if (data2 !== null) {
                  const err0 = {
                    instancePath: instancePath + '/collaborationMode',
                    schemaPath: '#/properties/collaborationMode/anyOf/1/type',
                    keyword: 'type',
                    params: { type: 'null' },
                    message: 'must be null',
                  };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var _valid0 = _errs7 === errors;
                valid2 = valid2 || _valid0;
              }
              if (!valid2) {
                const err1 = {
                  instancePath: instancePath + '/collaborationMode',
                  schemaPath: '#/properties/collaborationMode/anyOf',
                  keyword: 'anyOf',
                  params: {},
                  message: 'must match a schema in anyOf',
                };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
                validate189.errors = vErrors;
                return false;
              } else {
                errors = _errs5;
                if (vErrors !== null) {
                  if (_errs5) {
                    vErrors.length = _errs5;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.cwd !== void 0) {
                const _errs9 = errors;
                if (
                  !validate31(data.cwd, {
                    instancePath: instancePath + '/cwd',
                    parentData: data,
                    parentDataProperty: 'cwd',
                    rootData,
                  })
                ) {
                  vErrors =
                    vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                  errors = vErrors.length;
                }
                var valid0 = _errs9 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.disabledPluginIds !== void 0) {
                  let data4 = data.disabledPluginIds;
                  const _errs10 = errors;
                  if (errors === _errs10) {
                    if (Array.isArray(data4)) {
                      var valid3 = true;
                      const len0 = data4.length;
                      for (let i0 = 0; i0 < len0; i0++) {
                        const _errs12 = errors;
                        if (typeof data4[i0] !== 'string') {
                          validate189.errors = [
                            {
                              instancePath: instancePath + '/disabledPluginIds/' + i0,
                              schemaPath: '#/properties/disabledPluginIds/items/type',
                              keyword: 'type',
                              params: { type: 'string' },
                              message: 'must be string',
                            },
                          ];
                          return false;
                        }
                        var valid3 = _errs12 === errors;
                        if (!valid3) {
                          break;
                        }
                      }
                    } else {
                      validate189.errors = [
                        {
                          instancePath: instancePath + '/disabledPluginIds',
                          schemaPath: '#/properties/disabledPluginIds/type',
                          keyword: 'type',
                          params: { type: 'array' },
                          message: 'must be array',
                        },
                      ];
                      return false;
                    }
                  }
                  var valid0 = _errs10 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.instructionSources !== void 0) {
                    let data6 = data.instructionSources;
                    const _errs14 = errors;
                    if (errors === _errs14) {
                      if (Array.isArray(data6)) {
                        var valid4 = true;
                        const len1 = data6.length;
                        for (let i1 = 0; i1 < len1; i1++) {
                          const _errs16 = errors;
                          if (
                            !validate54(data6[i1], {
                              instancePath: instancePath + '/instructionSources/' + i1,
                              parentData: data6,
                              parentDataProperty: i1,
                              rootData,
                            })
                          ) {
                            vErrors =
                              vErrors === null
                                ? validate54.errors
                                : vErrors.concat(validate54.errors);
                            errors = vErrors.length;
                          }
                          var valid4 = _errs16 === errors;
                          if (!valid4) {
                            break;
                          }
                        }
                      } else {
                        validate189.errors = [
                          {
                            instancePath: instancePath + '/instructionSources',
                            schemaPath: '#/properties/instructionSources/type',
                            keyword: 'type',
                            params: { type: 'array' },
                            message: 'must be array',
                          },
                        ];
                        return false;
                      }
                    }
                    var valid0 = _errs14 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.itemsBackwardsCursor !== void 0) {
                      let data8 = data.itemsBackwardsCursor;
                      const _errs17 = errors;
                      if (typeof data8 !== 'string' && data8 !== null) {
                        validate189.errors = [
                          {
                            instancePath: instancePath + '/itemsBackwardsCursor',
                            schemaPath: '#/properties/itemsBackwardsCursor/type',
                            keyword: 'type',
                            params: { type: schema84.properties.itemsBackwardsCursor.type },
                            message: 'must be string,null',
                          },
                        ];
                        return false;
                      }
                      var valid0 = _errs17 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.model !== void 0) {
                        const _errs19 = errors;
                        if (typeof data.model !== 'string') {
                          validate189.errors = [
                            {
                              instancePath: instancePath + '/model',
                              schemaPath: '#/properties/model/type',
                              keyword: 'type',
                              params: { type: 'string' },
                              message: 'must be string',
                            },
                          ];
                          return false;
                        }
                        var valid0 = _errs19 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.modelProvider !== void 0) {
                          const _errs21 = errors;
                          if (typeof data.modelProvider !== 'string') {
                            validate189.errors = [
                              {
                                instancePath: instancePath + '/modelProvider',
                                schemaPath: '#/properties/modelProvider/type',
                                keyword: 'type',
                                params: { type: 'string' },
                                message: 'must be string',
                              },
                            ];
                            return false;
                          }
                          var valid0 = _errs21 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.reasoningEffort !== void 0) {
                            let data11 = data.reasoningEffort;
                            const _errs23 = errors;
                            const _errs24 = errors;
                            let valid5 = false;
                            const _errs25 = errors;
                            if (
                              !validate56(data11, {
                                instancePath: instancePath + '/reasoningEffort',
                                parentData: data,
                                parentDataProperty: 'reasoningEffort',
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate56.errors
                                  : vErrors.concat(validate56.errors);
                              errors = vErrors.length;
                            }
                            var _valid1 = _errs25 === errors;
                            valid5 = valid5 || _valid1;
                            if (!valid5) {
                              const _errs26 = errors;
                              if (data11 !== null) {
                                const err2 = {
                                  instancePath: instancePath + '/reasoningEffort',
                                  schemaPath: '#/properties/reasoningEffort/anyOf/1/type',
                                  keyword: 'type',
                                  params: { type: 'null' },
                                  message: 'must be null',
                                };
                                if (vErrors === null) {
                                  vErrors = [err2];
                                } else {
                                  vErrors.push(err2);
                                }
                                errors++;
                              }
                              var _valid1 = _errs26 === errors;
                              valid5 = valid5 || _valid1;
                            }
                            if (!valid5) {
                              const err3 = {
                                instancePath: instancePath + '/reasoningEffort',
                                schemaPath: '#/properties/reasoningEffort/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                              };
                              if (vErrors === null) {
                                vErrors = [err3];
                              } else {
                                vErrors.push(err3);
                              }
                              errors++;
                              validate189.errors = vErrors;
                              return false;
                            } else {
                              errors = _errs24;
                              if (vErrors !== null) {
                                if (_errs24) {
                                  vErrors.length = _errs24;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid0 = _errs23 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.sandbox !== void 0) {
                              const _errs28 = errors;
                              if (
                                !validate58(data.sandbox, {
                                  instancePath: instancePath + '/sandbox',
                                  parentData: data,
                                  parentDataProperty: 'sandbox',
                                  rootData,
                                })
                              ) {
                                vErrors =
                                  vErrors === null
                                    ? validate58.errors
                                    : vErrors.concat(validate58.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs28 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.serviceTier !== void 0) {
                                let data13 = data.serviceTier;
                                const _errs30 = errors;
                                if (typeof data13 !== 'string' && data13 !== null) {
                                  validate189.errors = [
                                    {
                                      instancePath: instancePath + '/serviceTier',
                                      schemaPath: '#/properties/serviceTier/type',
                                      keyword: 'type',
                                      params: { type: schema84.properties.serviceTier.type },
                                      message: 'must be string,null',
                                    },
                                  ];
                                  return false;
                                }
                                var valid0 = _errs30 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.thread !== void 0) {
                                  const _errs32 = errors;
                                  if (
                                    !validate63(data.thread, {
                                      instancePath: instancePath + '/thread',
                                      parentData: data,
                                      parentDataProperty: 'thread',
                                      rootData,
                                    })
                                  ) {
                                    vErrors =
                                      vErrors === null
                                        ? validate63.errors
                                        : vErrors.concat(validate63.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid0 = _errs32 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.turnsBackwardsCursor !== void 0) {
                                    let data15 = data.turnsBackwardsCursor;
                                    const _errs33 = errors;
                                    if (typeof data15 !== 'string' && data15 !== null) {
                                      validate189.errors = [
                                        {
                                          instancePath: instancePath + '/turnsBackwardsCursor',
                                          schemaPath: '#/properties/turnsBackwardsCursor/type',
                                          keyword: 'type',
                                          params: {
                                            type: schema84.properties.turnsBackwardsCursor.type,
                                          },
                                          message: 'must be string,null',
                                        },
                                      ];
                                      return false;
                                    }
                                    var valid0 = _errs33 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate189.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate189.errors = vErrors;
  return errors === 0;
}
function validate188(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate189(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate189.errors : vErrors.concat(validate189.errors);
    errors = vErrors.length;
  }
  validate188.errors = vErrors;
  return errors === 0;
}
var request3Params = validate205;
var schema89 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    approvalPolicy: {
      anyOf: [{ $ref: '#/definitions/v2/AskForApproval' }, { type: 'null' }],
      description: 'Override the approval policy for this turn and subsequent turns.',
    },
    approvalsReviewer: {
      anyOf: [{ $ref: '#/definitions/v2/ApprovalsReviewer' }, { type: 'null' }],
      description:
        'Override where approval requests are routed for review on this turn and subsequent turns.',
    },
    clientUserMessageId: { type: ['string', 'null'] },
    cwd: {
      description: 'Override the working directory for this turn and subsequent turns.',
      type: ['string', 'null'],
    },
    disabledPluginIds: {
      description:
        "Replace this thread's disabled plugin IDs. Omitted/null preserves the list; [] clears it.",
      items: { type: 'string' },
      type: ['array', 'null'],
    },
    effort: {
      anyOf: [{ $ref: '#/definitions/v2/ReasoningEffort' }, { type: 'null' }],
      description: 'Override the reasoning effort for this turn and subsequent turns.',
    },
    input: { items: { $ref: '#/definitions/v2/UserInput' }, type: 'array' },
    model: {
      description: 'Override the model for this turn and subsequent turns.',
      type: ['string', 'null'],
    },
    outputSchema: {
      description:
        'Optional JSON Schema used to constrain the final assistant message for this turn.',
    },
    parentTurnId: {
      description:
        'ID of the turn that caused this new turn to start.\n\nSet this when starting work on behalf of another turn, such as delegated work in a different thread. Leave unset for work started directly by the user. Ignored when this request adds input to an active turn.',
      type: ['string', 'null'],
    },
    personality: {
      anyOf: [{ $ref: '#/definitions/v2/Personality' }, { type: 'null' }],
      description:
        "@deprecated `friendly` and `pragmatic` no longer select a style. Changing this does not rewrite the thread's existing instructions.",
    },
    rootTurnId: {
      description:
        "ID of the first turn in the chain of work that led to this new turn.\n\nWhen setting `parentTurnId`, set this to the parent turn's `rootTurnId` when known. This keeps descendant work attributed to the original turn. If omitted, the new turn becomes its own root. Ignored when this request adds input to an active turn.",
      type: ['string', 'null'],
    },
    sandboxPolicy: {
      anyOf: [{ $ref: '#/definitions/v2/SandboxPolicy' }, { type: 'null' }],
      description: 'Override the sandbox policy for this turn and subsequent turns.',
    },
    serviceTier: {
      description: 'Override the service tier for this turn and subsequent turns.',
      type: ['string', 'null'],
    },
    serviceTierForTurn: {
      description: `Override the service tier only when this request starts a new turn. Use "default" for standard speed. Omitted or null inherits the thread's tier. Does not change the thread's tier or a turn being steered.`,
      type: ['string', 'null'],
    },
    summary: {
      anyOf: [{ $ref: '#/definitions/v2/ReasoningSummary' }, { type: 'null' }],
      description: 'Override the reasoning summary for this turn and subsequent turns.',
    },
    threadId: { type: 'string' },
    toolOutput: { anyOf: [{ $ref: '#/definitions/v2/TurnToolOutput' }, { type: 'null' }] },
    turnTrigger: {
      description:
        'Optional source classification for the caller that starts this turn. Ignored when this request steers an already-active turn.',
      type: ['string', 'null'],
    },
  },
  required: ['input', 'threadId'],
  title: 'TurnStartParams',
  type: 'object',
};
var schema90 = {
  description:
    "A summary of the reasoning performed by the model. This can be useful for debugging and understanding the model's reasoning process. See https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries",
  oneOf: [
    { enum: ['auto', 'concise', 'detailed'], type: 'string' },
    { description: 'Option to disable reasoning summaries.', enum: ['none'], type: 'string' },
  ],
};
function validate213(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== 'string') {
    const err0 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === 'auto' || data === 'concise' || data === 'detailed')) {
    const err1 = {
      instancePath,
      schemaPath: '#/oneOf/0/enum',
      keyword: 'enum',
      params: { allowedValues: schema90.oneOf[0].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (typeof data !== 'string') {
    const err2 = {
      instancePath,
      schemaPath: '#/oneOf/1/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  if (!(data === 'none')) {
    const err3 = {
      instancePath,
      schemaPath: '#/oneOf/1/enum',
      keyword: 'enum',
      params: { allowedValues: schema90.oneOf[1].enum },
      message: 'must be equal to one of the allowed values',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err4 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
    validate213.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate213.errors = vErrors;
  return errors === 0;
}
var schema91 = {
  properties: {
    name: { type: 'string' },
    namespace: { type: ['string', 'null'] },
    output: { $ref: '#/definitions/v2/FunctionCallOutputBody' },
    retain: {
      description: "Requests retention of this output in the thread's model history.",
      type: 'boolean',
    },
  },
  required: ['name', 'output'],
  type: 'object',
};
function validate215(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.name === void 0 && (missing0 = 'name')) ||
        (data.output === void 0 && (missing0 = 'output'))
      ) {
        validate215.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.name !== void 0) {
          const _errs1 = errors;
          if (typeof data.name !== 'string') {
            validate215.errors = [
              {
                instancePath: instancePath + '/name',
                schemaPath: '#/properties/name/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.namespace !== void 0) {
            let data1 = data.namespace;
            const _errs3 = errors;
            if (typeof data1 !== 'string' && data1 !== null) {
              validate215.errors = [
                {
                  instancePath: instancePath + '/namespace',
                  schemaPath: '#/properties/namespace/type',
                  keyword: 'type',
                  params: { type: schema91.properties.namespace.type },
                  message: 'must be string,null',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.output !== void 0) {
              const _errs5 = errors;
              if (
                !validate120(data.output, {
                  instancePath: instancePath + '/output',
                  parentData: data,
                  parentDataProperty: 'output',
                  rootData,
                })
              ) {
                vErrors =
                  vErrors === null ? validate120.errors : vErrors.concat(validate120.errors);
                errors = vErrors.length;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.retain !== void 0) {
                const _errs6 = errors;
                if (typeof data.retain !== 'boolean') {
                  validate215.errors = [
                    {
                      instancePath: instancePath + '/retain',
                      schemaPath: '#/properties/retain/type',
                      keyword: 'type',
                      params: { type: 'boolean' },
                      message: 'must be boolean',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate215.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate215.errors = vErrors;
  return errors === 0;
}
function validate206(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.input === void 0 && (missing0 = 'input')) ||
        (data.threadId === void 0 && (missing0 = 'threadId'))
      ) {
        validate206.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.approvalPolicy !== void 0) {
          let data0 = data.approvalPolicy;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          if (
            !validate36(data0, {
              instancePath: instancePath + '/approvalPolicy',
              parentData: data,
              parentDataProperty: 'approvalPolicy',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs4 = errors;
            if (data0 !== null) {
              const err0 = {
                instancePath: instancePath + '/approvalPolicy',
                schemaPath: '#/properties/approvalPolicy/anyOf/1/type',
                keyword: 'type',
                params: { type: 'null' },
                message: 'must be null',
              };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
            var _valid0 = _errs4 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err1 = {
              instancePath: instancePath + '/approvalPolicy',
              schemaPath: '#/properties/approvalPolicy/anyOf',
              keyword: 'anyOf',
              params: {},
              message: 'must match a schema in anyOf',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate206.errors = vErrors;
            return false;
          } else {
            errors = _errs2;
            if (vErrors !== null) {
              if (_errs2) {
                vErrors.length = _errs2;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.approvalsReviewer !== void 0) {
            let data1 = data.approvalsReviewer;
            const _errs6 = errors;
            const _errs7 = errors;
            let valid2 = false;
            const _errs8 = errors;
            if (
              !validate38(data1, {
                instancePath: instancePath + '/approvalsReviewer',
                parentData: data,
                parentDataProperty: 'approvalsReviewer',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
              errors = vErrors.length;
            }
            var _valid1 = _errs8 === errors;
            valid2 = valid2 || _valid1;
            if (!valid2) {
              const _errs9 = errors;
              if (data1 !== null) {
                const err2 = {
                  instancePath: instancePath + '/approvalsReviewer',
                  schemaPath: '#/properties/approvalsReviewer/anyOf/1/type',
                  keyword: 'type',
                  params: { type: 'null' },
                  message: 'must be null',
                };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
              var _valid1 = _errs9 === errors;
              valid2 = valid2 || _valid1;
            }
            if (!valid2) {
              const err3 = {
                instancePath: instancePath + '/approvalsReviewer',
                schemaPath: '#/properties/approvalsReviewer/anyOf',
                keyword: 'anyOf',
                params: {},
                message: 'must match a schema in anyOf',
              };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
              validate206.errors = vErrors;
              return false;
            } else {
              errors = _errs7;
              if (vErrors !== null) {
                if (_errs7) {
                  vErrors.length = _errs7;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid0 = _errs6 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.clientUserMessageId !== void 0) {
              let data2 = data.clientUserMessageId;
              const _errs11 = errors;
              if (typeof data2 !== 'string' && data2 !== null) {
                validate206.errors = [
                  {
                    instancePath: instancePath + '/clientUserMessageId',
                    schemaPath: '#/properties/clientUserMessageId/type',
                    keyword: 'type',
                    params: { type: schema89.properties.clientUserMessageId.type },
                    message: 'must be string,null',
                  },
                ];
                return false;
              }
              var valid0 = _errs11 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.cwd !== void 0) {
                let data3 = data.cwd;
                const _errs13 = errors;
                if (typeof data3 !== 'string' && data3 !== null) {
                  validate206.errors = [
                    {
                      instancePath: instancePath + '/cwd',
                      schemaPath: '#/properties/cwd/type',
                      keyword: 'type',
                      params: { type: schema89.properties.cwd.type },
                      message: 'must be string,null',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs13 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.disabledPluginIds !== void 0) {
                  let data4 = data.disabledPluginIds;
                  const _errs15 = errors;
                  if (!Array.isArray(data4) && data4 !== null) {
                    validate206.errors = [
                      {
                        instancePath: instancePath + '/disabledPluginIds',
                        schemaPath: '#/properties/disabledPluginIds/type',
                        keyword: 'type',
                        params: { type: schema89.properties.disabledPluginIds.type },
                        message: 'must be array,null',
                      },
                    ];
                    return false;
                  }
                  if (errors === _errs15) {
                    if (Array.isArray(data4)) {
                      var valid3 = true;
                      const len0 = data4.length;
                      for (let i0 = 0; i0 < len0; i0++) {
                        const _errs17 = errors;
                        if (typeof data4[i0] !== 'string') {
                          validate206.errors = [
                            {
                              instancePath: instancePath + '/disabledPluginIds/' + i0,
                              schemaPath: '#/properties/disabledPluginIds/items/type',
                              keyword: 'type',
                              params: { type: 'string' },
                              message: 'must be string',
                            },
                          ];
                          return false;
                        }
                        var valid3 = _errs17 === errors;
                        if (!valid3) {
                          break;
                        }
                      }
                    }
                  }
                  var valid0 = _errs15 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.effort !== void 0) {
                    let data6 = data.effort;
                    const _errs19 = errors;
                    const _errs20 = errors;
                    let valid4 = false;
                    const _errs21 = errors;
                    if (
                      !validate56(data6, {
                        instancePath: instancePath + '/effort',
                        parentData: data,
                        parentDataProperty: 'effort',
                        rootData,
                      })
                    ) {
                      vErrors =
                        vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
                      errors = vErrors.length;
                    }
                    var _valid2 = _errs21 === errors;
                    valid4 = valid4 || _valid2;
                    if (!valid4) {
                      const _errs22 = errors;
                      if (data6 !== null) {
                        const err4 = {
                          instancePath: instancePath + '/effort',
                          schemaPath: '#/properties/effort/anyOf/1/type',
                          keyword: 'type',
                          params: { type: 'null' },
                          message: 'must be null',
                        };
                        if (vErrors === null) {
                          vErrors = [err4];
                        } else {
                          vErrors.push(err4);
                        }
                        errors++;
                      }
                      var _valid2 = _errs22 === errors;
                      valid4 = valid4 || _valid2;
                    }
                    if (!valid4) {
                      const err5 = {
                        instancePath: instancePath + '/effort',
                        schemaPath: '#/properties/effort/anyOf',
                        keyword: 'anyOf',
                        params: {},
                        message: 'must match a schema in anyOf',
                      };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                      validate206.errors = vErrors;
                      return false;
                    } else {
                      errors = _errs20;
                      if (vErrors !== null) {
                        if (_errs20) {
                          vErrors.length = _errs20;
                        } else {
                          vErrors = null;
                        }
                      }
                    }
                    var valid0 = _errs19 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.input !== void 0) {
                      let data7 = data.input;
                      const _errs24 = errors;
                      if (errors === _errs24) {
                        if (Array.isArray(data7)) {
                          var valid5 = true;
                          const len1 = data7.length;
                          for (let i1 = 0; i1 < len1; i1++) {
                            const _errs26 = errors;
                            if (
                              !validate99(data7[i1], {
                                instancePath: instancePath + '/input/' + i1,
                                parentData: data7,
                                parentDataProperty: i1,
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate99.errors
                                  : vErrors.concat(validate99.errors);
                              errors = vErrors.length;
                            }
                            var valid5 = _errs26 === errors;
                            if (!valid5) {
                              break;
                            }
                          }
                        } else {
                          validate206.errors = [
                            {
                              instancePath: instancePath + '/input',
                              schemaPath: '#/properties/input/type',
                              keyword: 'type',
                              params: { type: 'array' },
                              message: 'must be array',
                            },
                          ];
                          return false;
                        }
                      }
                      var valid0 = _errs24 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.model !== void 0) {
                        let data9 = data.model;
                        const _errs27 = errors;
                        if (typeof data9 !== 'string' && data9 !== null) {
                          validate206.errors = [
                            {
                              instancePath: instancePath + '/model',
                              schemaPath: '#/properties/model/type',
                              keyword: 'type',
                              params: { type: schema89.properties.model.type },
                              message: 'must be string,null',
                            },
                          ];
                          return false;
                        }
                        var valid0 = _errs27 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.parentTurnId !== void 0) {
                          let data10 = data.parentTurnId;
                          const _errs29 = errors;
                          if (typeof data10 !== 'string' && data10 !== null) {
                            validate206.errors = [
                              {
                                instancePath: instancePath + '/parentTurnId',
                                schemaPath: '#/properties/parentTurnId/type',
                                keyword: 'type',
                                params: { type: schema89.properties.parentTurnId.type },
                                message: 'must be string,null',
                              },
                            ];
                            return false;
                          }
                          var valid0 = _errs29 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.personality !== void 0) {
                            let data11 = data.personality;
                            const _errs31 = errors;
                            const _errs32 = errors;
                            let valid6 = false;
                            const _errs33 = errors;
                            if (
                              !validate40(data11, {
                                instancePath: instancePath + '/personality',
                                parentData: data,
                                parentDataProperty: 'personality',
                                rootData,
                              })
                            ) {
                              vErrors =
                                vErrors === null
                                  ? validate40.errors
                                  : vErrors.concat(validate40.errors);
                              errors = vErrors.length;
                            }
                            var _valid3 = _errs33 === errors;
                            valid6 = valid6 || _valid3;
                            if (!valid6) {
                              const _errs34 = errors;
                              if (data11 !== null) {
                                const err6 = {
                                  instancePath: instancePath + '/personality',
                                  schemaPath: '#/properties/personality/anyOf/1/type',
                                  keyword: 'type',
                                  params: { type: 'null' },
                                  message: 'must be null',
                                };
                                if (vErrors === null) {
                                  vErrors = [err6];
                                } else {
                                  vErrors.push(err6);
                                }
                                errors++;
                              }
                              var _valid3 = _errs34 === errors;
                              valid6 = valid6 || _valid3;
                            }
                            if (!valid6) {
                              const err7 = {
                                instancePath: instancePath + '/personality',
                                schemaPath: '#/properties/personality/anyOf',
                                keyword: 'anyOf',
                                params: {},
                                message: 'must match a schema in anyOf',
                              };
                              if (vErrors === null) {
                                vErrors = [err7];
                              } else {
                                vErrors.push(err7);
                              }
                              errors++;
                              validate206.errors = vErrors;
                              return false;
                            } else {
                              errors = _errs32;
                              if (vErrors !== null) {
                                if (_errs32) {
                                  vErrors.length = _errs32;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid0 = _errs31 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.rootTurnId !== void 0) {
                              let data12 = data.rootTurnId;
                              const _errs36 = errors;
                              if (typeof data12 !== 'string' && data12 !== null) {
                                validate206.errors = [
                                  {
                                    instancePath: instancePath + '/rootTurnId',
                                    schemaPath: '#/properties/rootTurnId/type',
                                    keyword: 'type',
                                    params: { type: schema89.properties.rootTurnId.type },
                                    message: 'must be string,null',
                                  },
                                ];
                                return false;
                              }
                              var valid0 = _errs36 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.sandboxPolicy !== void 0) {
                                let data13 = data.sandboxPolicy;
                                const _errs38 = errors;
                                const _errs39 = errors;
                                let valid7 = false;
                                const _errs40 = errors;
                                if (
                                  !validate58(data13, {
                                    instancePath: instancePath + '/sandboxPolicy',
                                    parentData: data,
                                    parentDataProperty: 'sandboxPolicy',
                                    rootData,
                                  })
                                ) {
                                  vErrors =
                                    vErrors === null
                                      ? validate58.errors
                                      : vErrors.concat(validate58.errors);
                                  errors = vErrors.length;
                                }
                                var _valid4 = _errs40 === errors;
                                valid7 = valid7 || _valid4;
                                if (!valid7) {
                                  const _errs41 = errors;
                                  if (data13 !== null) {
                                    const err8 = {
                                      instancePath: instancePath + '/sandboxPolicy',
                                      schemaPath: '#/properties/sandboxPolicy/anyOf/1/type',
                                      keyword: 'type',
                                      params: { type: 'null' },
                                      message: 'must be null',
                                    };
                                    if (vErrors === null) {
                                      vErrors = [err8];
                                    } else {
                                      vErrors.push(err8);
                                    }
                                    errors++;
                                  }
                                  var _valid4 = _errs41 === errors;
                                  valid7 = valid7 || _valid4;
                                }
                                if (!valid7) {
                                  const err9 = {
                                    instancePath: instancePath + '/sandboxPolicy',
                                    schemaPath: '#/properties/sandboxPolicy/anyOf',
                                    keyword: 'anyOf',
                                    params: {},
                                    message: 'must match a schema in anyOf',
                                  };
                                  if (vErrors === null) {
                                    vErrors = [err9];
                                  } else {
                                    vErrors.push(err9);
                                  }
                                  errors++;
                                  validate206.errors = vErrors;
                                  return false;
                                } else {
                                  errors = _errs39;
                                  if (vErrors !== null) {
                                    if (_errs39) {
                                      vErrors.length = _errs39;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid0 = _errs38 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.serviceTier !== void 0) {
                                  let data14 = data.serviceTier;
                                  const _errs43 = errors;
                                  if (typeof data14 !== 'string' && data14 !== null) {
                                    validate206.errors = [
                                      {
                                        instancePath: instancePath + '/serviceTier',
                                        schemaPath: '#/properties/serviceTier/type',
                                        keyword: 'type',
                                        params: { type: schema89.properties.serviceTier.type },
                                        message: 'must be string,null',
                                      },
                                    ];
                                    return false;
                                  }
                                  var valid0 = _errs43 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.serviceTierForTurn !== void 0) {
                                    let data15 = data.serviceTierForTurn;
                                    const _errs45 = errors;
                                    if (typeof data15 !== 'string' && data15 !== null) {
                                      validate206.errors = [
                                        {
                                          instancePath: instancePath + '/serviceTierForTurn',
                                          schemaPath: '#/properties/serviceTierForTurn/type',
                                          keyword: 'type',
                                          params: {
                                            type: schema89.properties.serviceTierForTurn.type,
                                          },
                                          message: 'must be string,null',
                                        },
                                      ];
                                      return false;
                                    }
                                    var valid0 = _errs45 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.summary !== void 0) {
                                      let data16 = data.summary;
                                      const _errs47 = errors;
                                      const _errs48 = errors;
                                      let valid8 = false;
                                      const _errs49 = errors;
                                      if (
                                        !validate213(data16, {
                                          instancePath: instancePath + '/summary',
                                          parentData: data,
                                          parentDataProperty: 'summary',
                                          rootData,
                                        })
                                      ) {
                                        vErrors =
                                          vErrors === null
                                            ? validate213.errors
                                            : vErrors.concat(validate213.errors);
                                        errors = vErrors.length;
                                      }
                                      var _valid5 = _errs49 === errors;
                                      valid8 = valid8 || _valid5;
                                      if (!valid8) {
                                        const _errs50 = errors;
                                        if (data16 !== null) {
                                          const err10 = {
                                            instancePath: instancePath + '/summary',
                                            schemaPath: '#/properties/summary/anyOf/1/type',
                                            keyword: 'type',
                                            params: { type: 'null' },
                                            message: 'must be null',
                                          };
                                          if (vErrors === null) {
                                            vErrors = [err10];
                                          } else {
                                            vErrors.push(err10);
                                          }
                                          errors++;
                                        }
                                        var _valid5 = _errs50 === errors;
                                        valid8 = valid8 || _valid5;
                                      }
                                      if (!valid8) {
                                        const err11 = {
                                          instancePath: instancePath + '/summary',
                                          schemaPath: '#/properties/summary/anyOf',
                                          keyword: 'anyOf',
                                          params: {},
                                          message: 'must match a schema in anyOf',
                                        };
                                        if (vErrors === null) {
                                          vErrors = [err11];
                                        } else {
                                          vErrors.push(err11);
                                        }
                                        errors++;
                                        validate206.errors = vErrors;
                                        return false;
                                      } else {
                                        errors = _errs48;
                                        if (vErrors !== null) {
                                          if (_errs48) {
                                            vErrors.length = _errs48;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid0 = _errs47 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.threadId !== void 0) {
                                        const _errs52 = errors;
                                        if (typeof data.threadId !== 'string') {
                                          validate206.errors = [
                                            {
                                              instancePath: instancePath + '/threadId',
                                              schemaPath: '#/properties/threadId/type',
                                              keyword: 'type',
                                              params: { type: 'string' },
                                              message: 'must be string',
                                            },
                                          ];
                                          return false;
                                        }
                                        var valid0 = _errs52 === errors;
                                      } else {
                                        var valid0 = true;
                                      }
                                      if (valid0) {
                                        if (data.toolOutput !== void 0) {
                                          let data18 = data.toolOutput;
                                          const _errs54 = errors;
                                          const _errs55 = errors;
                                          let valid9 = false;
                                          const _errs56 = errors;
                                          if (
                                            !validate215(data18, {
                                              instancePath: instancePath + '/toolOutput',
                                              parentData: data,
                                              parentDataProperty: 'toolOutput',
                                              rootData,
                                            })
                                          ) {
                                            vErrors =
                                              vErrors === null
                                                ? validate215.errors
                                                : vErrors.concat(validate215.errors);
                                            errors = vErrors.length;
                                          }
                                          var _valid6 = _errs56 === errors;
                                          valid9 = valid9 || _valid6;
                                          if (!valid9) {
                                            const _errs57 = errors;
                                            if (data18 !== null) {
                                              const err12 = {
                                                instancePath: instancePath + '/toolOutput',
                                                schemaPath: '#/properties/toolOutput/anyOf/1/type',
                                                keyword: 'type',
                                                params: { type: 'null' },
                                                message: 'must be null',
                                              };
                                              if (vErrors === null) {
                                                vErrors = [err12];
                                              } else {
                                                vErrors.push(err12);
                                              }
                                              errors++;
                                            }
                                            var _valid6 = _errs57 === errors;
                                            valid9 = valid9 || _valid6;
                                          }
                                          if (!valid9) {
                                            const err13 = {
                                              instancePath: instancePath + '/toolOutput',
                                              schemaPath: '#/properties/toolOutput/anyOf',
                                              keyword: 'anyOf',
                                              params: {},
                                              message: 'must match a schema in anyOf',
                                            };
                                            if (vErrors === null) {
                                              vErrors = [err13];
                                            } else {
                                              vErrors.push(err13);
                                            }
                                            errors++;
                                            validate206.errors = vErrors;
                                            return false;
                                          } else {
                                            errors = _errs55;
                                            if (vErrors !== null) {
                                              if (_errs55) {
                                                vErrors.length = _errs55;
                                              } else {
                                                vErrors = null;
                                              }
                                            }
                                          }
                                          var valid0 = _errs54 === errors;
                                        } else {
                                          var valid0 = true;
                                        }
                                        if (valid0) {
                                          if (data.turnTrigger !== void 0) {
                                            let data19 = data.turnTrigger;
                                            const _errs59 = errors;
                                            if (typeof data19 !== 'string' && data19 !== null) {
                                              validate206.errors = [
                                                {
                                                  instancePath: instancePath + '/turnTrigger',
                                                  schemaPath: '#/properties/turnTrigger/type',
                                                  keyword: 'type',
                                                  params: {
                                                    type: schema89.properties.turnTrigger.type,
                                                  },
                                                  message: 'must be string,null',
                                                },
                                              ];
                                              return false;
                                            }
                                            var valid0 = _errs59 === errors;
                                          } else {
                                            var valid0 = true;
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate206.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate206.errors = vErrors;
  return errors === 0;
}
function validate205(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate206(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate206.errors : vErrors.concat(validate206.errors);
    errors = vErrors.length;
  }
  validate205.errors = vErrors;
  return errors === 0;
}
var request3Result = validate219;
function validate220(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (data.turn === void 0 && (missing0 = 'turn')) {
        validate220.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.turn !== void 0) {
          if (
            !validate87(data.turn, {
              instancePath: instancePath + '/turn',
              parentData: data,
              parentDataProperty: 'turn',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate87.errors : vErrors.concat(validate87.errors);
            errors = vErrors.length;
          }
        }
      }
    } else {
      validate220.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate220.errors = vErrors;
  return errors === 0;
}
function validate219(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate220(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate220.errors : vErrors.concat(validate220.errors);
    errors = vErrors.length;
  }
  validate219.errors = vErrors;
  return errors === 0;
}
var request4Params = validate223;
function validate224(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.threadId === void 0 && (missing0 = 'threadId')) ||
        (data.turnId === void 0 && (missing0 = 'turnId'))
      ) {
        validate224.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== 'string') {
            validate224.errors = [
              {
                instancePath: instancePath + '/threadId',
                schemaPath: '#/properties/threadId/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.turnId !== void 0) {
            const _errs3 = errors;
            if (typeof data.turnId !== 'string') {
              validate224.errors = [
                {
                  instancePath: instancePath + '/turnId',
                  schemaPath: '#/properties/turnId/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate224.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate224.errors = vErrors;
  return errors === 0;
}
function validate223(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate224(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate224.errors : vErrors.concat(validate224.errors);
    errors = vErrors.length;
  }
  validate223.errors = vErrors;
  return errors === 0;
}
var request4Result = validate226;
function validate227(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!(data && typeof data == 'object' && !Array.isArray(data))) {
    validate227.errors = [
      {
        instancePath,
        schemaPath: '#/type',
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object',
      },
    ];
    return false;
  }
  validate227.errors = vErrors;
  return errors === 0;
}
function validate226(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate227(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate227.errors : vErrors.concat(validate227.errors);
    errors = vErrors.length;
  }
  validate226.errors = vErrors;
  return errors === 0;
}
var notification0 = validate229;
function validate230(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.delta === void 0 && (missing0 = 'delta')) ||
        (data.itemId === void 0 && (missing0 = 'itemId')) ||
        (data.threadId === void 0 && (missing0 = 'threadId')) ||
        (data.turnId === void 0 && (missing0 = 'turnId'))
      ) {
        validate230.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.delta !== void 0) {
          const _errs1 = errors;
          if (typeof data.delta !== 'string') {
            validate230.errors = [
              {
                instancePath: instancePath + '/delta',
                schemaPath: '#/properties/delta/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.itemId !== void 0) {
            const _errs3 = errors;
            if (typeof data.itemId !== 'string') {
              validate230.errors = [
                {
                  instancePath: instancePath + '/itemId',
                  schemaPath: '#/properties/itemId/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.threadId !== void 0) {
              const _errs5 = errors;
              if (typeof data.threadId !== 'string') {
                validate230.errors = [
                  {
                    instancePath: instancePath + '/threadId',
                    schemaPath: '#/properties/threadId/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.turnId !== void 0) {
                const _errs7 = errors;
                if (typeof data.turnId !== 'string') {
                  validate230.errors = [
                    {
                      instancePath: instancePath + '/turnId',
                      schemaPath: '#/properties/turnId/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate230.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate230.errors = vErrors;
  return errors === 0;
}
function validate229(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate230(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate230.errors : vErrors.concat(validate230.errors);
    errors = vErrors.length;
  }
  validate229.errors = vErrors;
  return errors === 0;
}
var notification1 = validate232;
function validate233(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.delta === void 0 && (missing0 = 'delta')) ||
        (data.itemId === void 0 && (missing0 = 'itemId')) ||
        (data.summaryIndex === void 0 && (missing0 = 'summaryIndex')) ||
        (data.threadId === void 0 && (missing0 = 'threadId')) ||
        (data.turnId === void 0 && (missing0 = 'turnId'))
      ) {
        validate233.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.delta !== void 0) {
          const _errs1 = errors;
          if (typeof data.delta !== 'string') {
            validate233.errors = [
              {
                instancePath: instancePath + '/delta',
                schemaPath: '#/properties/delta/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.itemId !== void 0) {
            const _errs3 = errors;
            if (typeof data.itemId !== 'string') {
              validate233.errors = [
                {
                  instancePath: instancePath + '/itemId',
                  schemaPath: '#/properties/itemId/type',
                  keyword: 'type',
                  params: { type: 'string' },
                  message: 'must be string',
                },
              ];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.summaryIndex !== void 0) {
              let data2 = data.summaryIndex;
              const _errs5 = errors;
              if (!(typeof data2 == 'number' && !(data2 % 1) && !isNaN(data2))) {
                validate233.errors = [
                  {
                    instancePath: instancePath + '/summaryIndex',
                    schemaPath: '#/properties/summaryIndex/type',
                    keyword: 'type',
                    params: { type: 'integer' },
                    message: 'must be integer',
                  },
                ];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.threadId !== void 0) {
                const _errs7 = errors;
                if (typeof data.threadId !== 'string') {
                  validate233.errors = [
                    {
                      instancePath: instancePath + '/threadId',
                      schemaPath: '#/properties/threadId/type',
                      keyword: 'type',
                      params: { type: 'string' },
                      message: 'must be string',
                    },
                  ];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.turnId !== void 0) {
                  const _errs9 = errors;
                  if (typeof data.turnId !== 'string') {
                    validate233.errors = [
                      {
                        instancePath: instancePath + '/turnId',
                        schemaPath: '#/properties/turnId/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      },
                    ];
                    return false;
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
              }
            }
          }
        }
      }
    } else {
      validate233.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate233.errors = vErrors;
  return errors === 0;
}
function validate232(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate233(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate233.errors : vErrors.concat(validate233.errors);
    errors = vErrors.length;
  }
  validate232.errors = vErrors;
  return errors === 0;
}
var notification2 = validate235;
function validate236(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      let missing0;
      if (
        (data.threadId === void 0 && (missing0 = 'threadId')) ||
        (data.turn === void 0 && (missing0 = 'turn'))
      ) {
        validate236.errors = [
          {
            instancePath,
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: missing0 },
            message: "must have required property '" + missing0 + "'",
          },
        ];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== 'string') {
            validate236.errors = [
              {
                instancePath: instancePath + '/threadId',
                schemaPath: '#/properties/threadId/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              },
            ];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.turn !== void 0) {
            const _errs3 = errors;
            if (
              !validate87(data.turn, {
                instancePath: instancePath + '/turn',
                parentData: data,
                parentDataProperty: 'turn',
                rootData,
              })
            ) {
              vErrors = vErrors === null ? validate87.errors : vErrors.concat(validate87.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate236.errors = [
        {
          instancePath,
          schemaPath: '#/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        },
      ];
      return false;
    }
  }
  validate236.errors = vErrors;
  return errors === 0;
}
function validate235(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (!validate236(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate236.errors : vErrors.concat(validate236.errors);
    errors = vErrors.length;
  }
  validate235.errors = vErrors;
  return errors === 0;
}
export {
  notification0,
  notification1,
  notification2,
  request0Params,
  request0Result,
  request1Params,
  request1Result,
  request2Params,
  request2Result,
  request3Params,
  request3Result,
  request4Params,
  request4Result,
};
