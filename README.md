<h1 align="center">
    Validation of links in HTML files
</h1>

<p align="center">
    A plugin for webpack which replaces invalid links in HTML files.
</p>

## Installation

```javascript
npm install validate-html-links-webpack-plugin --save-dev
```

## Usage

The plugin replaces invalid names of resource links with correct names relative to project path. This is especially useful when files contains chunkhash and there is no other way to change this at compile time.

```javascript
const ValidateHTMLLinksPlugin = require('validate-html-links-webpack-plugin');

module.exports = {
    plugins: [
        new ValidateHTMLLinksPlugin()
    ]
}
```

## Options

| Name        | Type            | Default                   | Description |
| :---------: |:---------------:| :------------------------:|:------------|
| types       | `Array<String>` | `['html', 'css', 'js']`   | The types for validation and replacement. Must include `html` type. |
| exclude     | `Array<String>` | `[]`                      | The files that will not be processed. If you include `html` file, then the entire file will be skipped.|
| output      | `Boolean`       |`true`                     | Show in the compilation output what has been changed. |

#### Example how to set these options:

```javascript
const ValidateHTMLLinksPlugin = require('validate-html-links-webpack-plugin');

module.exports = {
    plugins: [
        new ValidateHTMLLinksPlugin({
            types: ['html', 'js'],
            exclude: ['/interface/js/scripts/popup.js'],
            output: false
        })
    ]
}
```

## Validation Examples

Be aware that links compares by (a-z | A-Z | 0-9 | .). If comparable link has the same path and difference only in the `([[:alnum:]]|\.)`, then it will be the same link.

In short, match conditions:

- same path;
- difference of name only in range of a-z, A-Z, 0-9 or `'.'`;
- same type.

```javascript
/interface/js/scripts/popup.js === /interface/js/scripts/popup.abc123.min.js
/interface/js/scripts/popup.js === /interface/js/scripts/popup.another.js // be careful with dot names!
/interface/js/scripts/popup.js !== /interface/js/scripts/popup-another.js
/interface/js/scripts/popup.js !== /interface/js/scripts/popup-another.abc123.min.js
/interface/js/popup.js !== /interface/js/scripts/popup.js
/interface/js/scripts/popup.js !== /interface/js/scripts/popup.css
```

## Issues and requests

Feel free to use [issues](https://github.com/Amaimersion/validate-html-links-webpack-plugin/issues). [Pull requests](https://github.com/Amaimersion/validate-html-links-webpack-plugin/pulls) are also always welcome!
