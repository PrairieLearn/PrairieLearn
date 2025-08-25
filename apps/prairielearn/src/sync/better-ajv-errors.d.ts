declare module 'better-ajv-errors' {
  export default function betterAjvErrors(
    ajv: Ajv,
    schema: JSONSchemaType<any>,
    errors: AjvErrorObject[],
    options: {
      indent: number;
    },
  ): string;
}
