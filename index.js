/**
 * @module ValidateHTMLLinksWebpackPlugin
 * @version 1.0.0
 * @file A plugin for webpack which replaces invalid links in HTML files.
 * @author Sergey Kuznetsov <https://github.com/Amaimersion>
 * @license MIT
 * @see https://github.com/Amaimersion/validate-html-links-webpack-plugin
 */

'use strict';

class ValidateHTMLLinksWebpackPlugin {
    /**
     * Creates an instance of ValidateHTMLLinksWebpackPlugin.
     *
     * @param {Object} parameters
     *
     * @param {Array<String>} parameters.types
     * The types for validation and replacement.
     * Must include 'html' type.
     * Defaults to `['html', 'css', 'js']`.
     *
     * @param {Array<String>} parameters.exclude
     * The assets for exclude.
     * Can contain both whole HTML assets and individual assets (e.g. css, js).
     * Defaults to `[]`.
     *
     * @param {Boolean} parameters.output
     * Show which assets and links have been changed.
     * Defaults to `true`.
     */
    constructor(parameters) {
        parameters = parameters || {};

        //#region Type checking

        const propertiesTypes = {
            array: ['types', 'exclude'],
            boolean: ['output' /*, 'debug' */]
        }

        Object.keys(propertiesTypes).forEach((type) => {
            let check = undefined;

            switch(type) {
                case 'array':
                    check = (value) => {
                        return Array.isArray(value);
                    };
                    break;
                case 'boolean':
                    check = (value) => {
                        return typeof value === 'boolean';
                    };
                    break;
                default:
                    throw new Error('Unknown type for checking.');
            }

            for (let property of propertiesTypes[type]) {
                const value = parameters[property];

                if (typeof value === 'undefined') {
                    continue;
                }

                if (!check(value)) {
                    parameters[property] = undefined;
                    console.warn(
                        `\x1b[33m${'WARNING in '}\x1b[0m` +
                        'validate-html-links: ' +
                        `"${property}" must be an ${type} type. ` +
                        'The property was replaced to default.'
                    );
                }
            }
        });

        //#endregion

        this.pluginName = 'validate-html-links';
        this.warnings = [];
        this.errors = [];
        this.info = {};
        this.types = parameters.types || ['html', 'css', 'js'];
        this.exclude = parameters.exclude || [];
        this.output = typeof parameters.output === 'undefined' ? true : parameters.output;
        //this.debug = typeof parameters.debug === 'undefined' ? false : parameters.debug; // not implemented.
    }

    /**
     * "This method is called once by the webpack compiler while installing the plugin".
     *
     * @param {Object} compiler
     * "Represents the fully configured webpack environment".
     */
    apply(compiler) {
        /**
         * webpack 4+ comes with a new plugin system.
         * Check for hooks in order to support old plugin system.
         */
        if (compiler.hooks) {
            compiler.hooks.emit.tapAsync(this.pluginName, (compilation, callback) => {
                this.handleEmitHook(compilation, callback);
            });
            compiler.hooks.afterEmit.tapAsync(this.pluginName, (compilation, callback) => {
                this.handleAfterEmitHook(compilation, callback);
            });
        } else {
            compiler.plugin('emit', (compilation, callback) => {
                this.handleEmitHook(compilation, callback);
            });
            compiler.plugin('afterEmit', (compilation, callback) => {
                this.handleAfterEmitHook(compilation, callback);
            });
        }
    }

    /**
     * Handles "emit" compiler hook.
     *
     * @param {Object} compilation
     * "Represents a single build of versioned assets".
     *
     * @param {Function} callback
     * "Some compilation plugin steps are asynchronous,
     * and pass a callback function that must be invoked
     * when your plugin is finished running".
     *
     * @see https://webpack.js.org/api/compiler-hooks/#emit
     */
    handleEmitHook(compilation, callback) {
        // Get the necessary assets.
        const sortedAssets = this.sortAssets(compilation.assets);

        if (!sortedAssets.html || !Object.keys(sortedAssets.html).length) {
            this.errors.push(
                this.generateMessage('HTML files not found.')
            );
            return callback();
        }

        // Changing.
        Object.keys(sortedAssets.html).forEach((file) => {
            this.handleHTMLFile(file, sortedAssets.html[file].source, sortedAssets);
        });

        // Writing.
        Object.keys(sortedAssets.html).forEach((file) => {
            if (!sortedAssets.html[file].isChanged) {
                return;
            }

            compilation.assets[file].source = () => {
                return sortedAssets.html[file].source;
            };
            compilation.assets[file].size = () => {
                return sortedAssets.html[file].length;
            };
        });

        callback();
    }

    /**
     * Handles "afterEmit" compiler hook.
     *
     * @param {Object} compilation
     * "Represents a single build of versioned assets".
     *
     * @param {Function} callback
     * "Some compilation plugin steps are asynchronous,
     * and pass a callback function that must be invoked
     * when your plugin is finished running".
     *
     * @see https://webpack.js.org/api/compiler-hooks/#afteremit
     */
    handleAfterEmitHook(compilation, callback) {
        for (let warning of this.warnings) {
            compilation.warnings.push(warning);
        }

        for (let error of this.errors) {
            compilation.errors.push(error);
        }

        if (this.output && Object.keys(this.info).length) {
            const messageOptions = {
                pluginName: false, endDot: false
            };

            console.log(
                '\n' +
                `${this.generateMessage(this.pluginName, {
                   ...messageOptions, color: 'cyan'}
                )}` +
                ':'
            );

            Object.keys(this.info).forEach((file) => {
                console.log(
                    '\t' +
                    `${this.generateMessage(file, {
                        ...messageOptions, color: 'yellow'
                    })}` +
                    ':'
                );

                for (let change of this.info[file]) {
                    console.log(
                        '\t\t' +
                        `${this.generateMessage(change.from, {
                            ...messageOptions, color: 'red'
                        })}` +
                        `${this.generateMessage(' -> ', {
                            ...messageOptions, color: 'magenta'
                        })}` +
                        `${this.generateMessage(change.to, {
                            ...messageOptions, color: 'green'
                        })}`
                    );
                }
            });

            console.log('');
        }

        callback();
    }

    /**
     * Gets an assets that are only represented in `this.types`.
     *
     * @param {Object} compilationAssets
     * The raw assets from `compilation.assets`.
     *
     * @returns {{type: {file: {source: String, isChanged: false}}}}
     * A sorted assets.
     */
    sortAssets(compilationAssets) {
        /**
         * Type determination.
         *
         * @example
         * /(html$|css$|js$)/
         * Group 1: a type.
         */
        const regexpType = new RegExp(this.generateTypesRegExp({
            endOfString: true
        }), '');
        const sortedAssets = {};

        Object.keys(compilationAssets).forEach((key) => {
            if (this.exclude.includes(key)) {
                return;
            }

            const result = regexpType.exec(key);

            if (!result) {
                return;
            }

            if (result.length > 2) {
                this.warnings.push(
                    this.generateMessage(
                        `Cannot determine a type of ${key} because RegExp returned more than 1 type.`
                    )
                );

                return;
            }

            const type = result[1];

            if (!sortedAssets[type]) {
                sortedAssets[type] = {};
            }

            sortedAssets[type][key] = {
                source: type === 'html' ? compilationAssets[key].source() : undefined,
                isChanged: false
            };
        });

        return sortedAssets;
    }

    /**
     * Handles the HTML file content.
     *
     * @param {String} fileKey
     * The key (file path) in a sorted assets.
     *
     * @param {String} fileContent
     * The content of a HTML file.
     *
     * @param {Object} sortedAssets
     * The `this.types` assets.
     */
    handleHTMLFile(fileKey, fileContent, sortedAssets) {
        const contentAssets = this.getHTMLContentAssets(fileContent);
        const newContent = this.fixHTMLContent(fileContent, sortedAssets, contentAssets, fileKey);

        // Explicit comparison because we expecting `string || false`.
        if (newContent === false) {
            return;
        }

        sortedAssets.html[fileKey].source = newContent;
        sortedAssets.html[fileKey].isChanged = true;
    }

    /**
     * Gets a `this.types` assets from the HTML file content.
     *
     * @param {String} content
     * The content of a HTML file.
     *
     * @returns {{type: Array<String>}}
     * `this.types` assets from a HTML file.
     */
    getHTMLContentAssets(content) {
        // We need a single line without any control characters,
        // because RegExp handler is designed for this.
        content = this.removeControlCharactes(content);

        /**
         * Get a `this.types` link from a HTML file.
         *
         * @example
         * /(?<full>(?<prefix>src|href)[=]["|'](?<link>[^.]*)[\.](?<type>html|css|js)["|'])/g
         * full: `src="/interface/js/scripts/popup.js"`
         * prefix: 'href'
         * link: '/interface/js/scripts/popup'
         * type: 'js'
         */
        const regexpResources = new RegExp(
            `((src|href)[=]["|']([^.]*)[\\.]${this.generateTypesRegExp()}["|'])`,
            'g'
        );
        const groupResources = {
            full: 1,
            prefix: 2,
            link: 3,
            type: 4
        };

        let match = null;
        const resources = {};

        while ((match = regexpResources.exec(content)) !== null) {
            const type = match[groupResources.type];
            const link = match[groupResources.link];

            if (!type || !link) {
                return;
            }

            if (!resources[type]) {
                resources[type] = [];
            }

            resources[type].push(`${link}.${type}`);
        }

        return resources;
    }

    /**
     * Fixs a links in the HTML file content.
     *
     * @param {String} content
     * The content of a HTML file.
     *
     * @param {Object} rightAssets
     * The sorted assets of `compilation.assets`.
     *
     * @param {Object} currentAssets
     * The finded assets in the HTML file content.
     *
     * @param {String} fileKey
     * The key (file path) in a sorted assets.
     *
     * @returns {String|false}
     * A changed content.
     * If there were no changes, then `false` will be returned.
     */
    fixHTMLContent(content, rightAssets, currentAssets, fileKey) {
        /**
         * Separate a link.
         *
         * @example
         * /(?<full>(?<path>.*)(?<type>[.]html$|[.]css$|[.]js$))/m
         * full: '/interface/js/scripts/popup.js'
         * path: '/interface/js/scripts/popup'
         * type: '.js'
         */
        const regexpSeparate = new RegExp(
            `(.*)${this.generateTypesRegExp({singleDot: true, endOfString: true})}`,
            'm'
        );
        const groupSeparate = {
            path: 1,
            type: 2
        };

        const fixedLinks = [];
        let isChanged = false;

        Object.keys(currentAssets).forEach((currentType) => {
            for (let currentLink of currentAssets[currentType]) {
                if (fixedLinks.includes(currentLink)) {
                    continue;
                }

                if (this.exclude.includes(currentLink)) {
                    continue;
                }

                Object.keys(rightAssets[currentType]).forEach((rightLink) => {
                    if (currentLink === rightLink) {
                        return;
                    }

                    const separatedLink = regexpSeparate.exec(currentLink);
                    const currentLinkPath = separatedLink[groupSeparate.path];
                    const currentLinkType = separatedLink[groupSeparate.type];

                    /**
                     * Compare two links.
                     *
                     * Be aware that links compares by ([a-zA-Z0-9] | '.')!
                     * If comparable link has the same path and difference only
                     * in the ([[:alnum:]]|\.), then it will be the same link.
                     *
                     * So:
                     * /interface/js/scripts/popup.js === /interface/js/scripts/popup.abc123.min.js
                     * /interface/js/scripts/popup.js !== /interface/js/scripts/popup-another.123abc.min.js
                     *
                     * @example
                     * /(?<full>\/interface\/js\/scripts\/popup(?<difference>([[:alnum:]]|\.)*)\.js)/g
                     * full: '/interface/js/scripts/popup.bca8d921683c2ecb6f9a.min.js'
                     * difference: '.bca8d921683c2ecb6f9a.min'
                     */
                    const regexpMatch = new RegExp(
                        `(${currentLinkPath}(([a-zA-Z0-9]|\\.)*)\\${currentLinkType})`,
                        'g'
                    );

                    if (!regexpMatch.test(rightLink)) {
                        return;
                    }

                    content = content.replace(regexpMatch, rightLink);

                    if (!isChanged) {
                        isChanged = true;
                    }

                    fixedLinks.push(currentLink);

                    //#region Information for output

                    if (!fileKey) {
                        return;
                    }

                    if (!this.info[fileKey]) {
                        this.info[fileKey] = [];
                    }

                    this.info[fileKey].push({
                        from: currentLink,
                        to: rightLink
                    });

                    //#endregion
                })
            }
        });

        return isChanged ? content : false;
    }

    /**
     * Generates a message for terminal.
     *
     * @param {String} message
     * The raw message.
     *
     * @param {{pluginName: true, endDot: true, newLine: false, color: 'white'}} parameters
     * The modifications for a message.
     *
     * @returns {String}
     * A modified message.
     */
    generateMessage(message, parameters) {
        parameters = Object.assign({
            pluginName: true,
            endDot: true,
            newLine: false,
            color: 'white'
        }, parameters);

        if (parameters.pluginName) {
            message = `${this.pluginName}: ${message}`;
        }

        if (parameters.endDot && message.charAt(message.length - 1) !== '.') {
            message += '.';
        }

        if (parameters.newLine) {
            message += '\n';
        }

        /**
         * ANSI escape sequences for colors.
         *
         * @see https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color#answer-41407246
         * @see http://bluesock.org/~willkg/dev/ansi.html
         */
        switch(parameters.color) {
            case 'red':
                message = `\x1b[31m${message}\x1b[0m`;
                break;
            case 'green':
                message = `\x1b[32m${message}\x1b[0m`;
                break;
            case 'yellow':
                message = `\x1b[33m${message}\x1b[0m`;
                break;
            case 'blue':
                message = `\x1b[34m${message}\x1b[0m`;
                break;
            case 'magenta':
                message = `\x1b[35m${message}\x1b[0m`;
                break;
            case 'cyan':
                message = `\x1b[36m${message}\x1b[0m`;
                break;
            case 'white':
                message = `\x1b[37m${message}\x1b[0m`;
                break;
            default:
                throw new Error('Invalid color.')
        }

        return message;
    }

    /**
     * Generates a types RegExp based on `this.types`.
     *
     * @param {{endOfString: false, singleDot: false}} parameters
     * The modifications for a regular expression.
     *
     * @returns {String}
     * A `this.types` for the subsequent creation with `new RegExp()`.
     *
     * @example
     * endOfString: true
     * Output: '(html$|css$|js$)'
     *
     * @example
     * singleDot: true
     * Output: '([.]html|[.]css|[.]js)'
     */
    generateTypesRegExp(parameters) {
        parameters = Object.assign({
            endOfString: false,
            singleDot: false
        }, parameters);

        let regexp = '(';

        for (let index in this.types) {
            if (parameters.singleDot) {
                regexp += '[.]'
            }

            regexp += this.types[index];

            if (parameters.endOfString) {
                regexp += '$';
            }

            if (++index != this.types.length) {
                regexp += '|';
            }
        }

        return regexp + ')';
    }

    /**
     * Removes control characters from a string.
     *
     * @param {String} string
     * The string for processing.
     *
     * @returns {String}
     * A string without `\n\r\t`.
     */
    removeControlCharactes(string) {
        return string.replace(/[\n\r\t]/g, '')
    }
}

module.exports = ValidateHTMLLinksWebpackPlugin;
