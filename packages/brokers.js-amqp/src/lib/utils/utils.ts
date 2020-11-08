/* eslint-disable @typescript-eslint/ban-types */
/**
 * Verify if the input is an object literal (or class).
 * @param input The object to verify
 * @since 0.2.0
 * @private
 */
export function isObject(input: unknown): input is Record<PropertyKey, unknown> | object {
	return typeof input === 'object' && input ? input.constructor === Object : false;
}
