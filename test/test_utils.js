var fs = require('fs'),
    path = require('path'),
    parse5 = require('../index'),
    HTML = require('../lib/common/html');

function addSlashes(str) {
    return str
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n')
        .replace(/\f/g, '\\f')
        .replace(/\r/g, '\\r');
}

function createDiffMarker(markerPosition) {
    var marker = '';

    for (var i = 0; i < markerPosition - 1; i++)
        marker += ' ';

    return marker + '^\n';
}

//NOTE: creates test suites for each available tree adapter.
exports.generateTestsForEachTreeAdapter = function (moduleExports, ctor) {
    Object.keys(parse5.TreeAdapters).forEach(function (adapterName) {
        var tests = {},
            adapter = parse5.TreeAdapters[adapterName];

        ctor(tests, adapterName, adapter);

        Object.keys(tests).forEach(function (testName) {
            moduleExports['Tree adapter: ' + adapterName + ' - ' + testName] = tests[testName];
        });
    });
};

exports.getStringDiffMsg = function (actual, expected) {
    for (var i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
            var diffMsg = '\nString differ at index ' + i + '\n';

            var expectedStr = 'Expected: ' + addSlashes(expected.substring(i - 100, i + 1)),
                expectedDiffMarker = createDiffMarker(expectedStr.length);

            diffMsg += expectedStr + addSlashes(expected.substring(i + 1, i + 20)) + '\n' + expectedDiffMarker;

            var actualStr = 'Actual:   ' + addSlashes(actual.substring(i - 100, i + 1)),
                actualDiffMarker = createDiffMarker(actualStr.length);

            diffMsg += actualStr + addSlashes(actual.substring(i + 1, i + 20)) + '\n' + actualDiffMarker;

            return diffMsg;
        }
    }

    return '';
};

exports.removeNewLines = function (str) {
    return str
        .replace(/\r/g, '')
        .replace(/\n/g, '');
};

exports.loadSerializationTestData = function (dataDirPath) {
    var testSetFileDirs = fs.readdirSync(dataDirPath),
        tests = [],
        testIdx = 1;

    testSetFileDirs.forEach(function (dirName) {
        var srcFilePath = path.join(dataDirPath, dirName, 'src.html'),
            expectedFilePath = path.join(dataDirPath, dirName, 'expected.html'),
            src = fs.readFileSync(srcFilePath).toString(),
            expected = fs.readFileSync(expectedFilePath).toString();

        tests.push({
            idx: testIdx,
            name: dirName,
            src: src,
            expected: expected
        });

        testIdx++;
    });

    return tests;
};

exports.loadTreeConstructionTestData = function (dataDirs, treeAdapter) {
    var testIdx = 0,
        tests = [];

    dataDirs.forEach(function (dataDirPath) {
        var testSetFileNames = fs.readdirSync(dataDirPath);

        testSetFileNames.forEach(function (fileName) {
            var filePath = path.join(dataDirPath, fileName),
                testSet = fs.readFileSync(filePath).toString(),
                setName = fileName.replace('.dat', ''),
                testDescrs = [],
                curDirective = '',
                curDescr = null;

            testSet.split(/\r?\n/).forEach(function (line) {
                if (line === '#data') {
                    curDescr = {};
                    testDescrs.push(curDescr);
                }

                if (line[0] === '#') {
                    curDirective = line;
                    curDescr[curDirective] = [];
                }

                else
                    curDescr[curDirective].push(line);
            });

            testDescrs.forEach(function (descr) {
                var fragmentContextTagName = descr['#document-fragment'] && descr['#document-fragment'].join('');

                tests.push({
                    idx: ++testIdx,
                    setName: setName,
                    input: descr['#data'].join('\r\n'),
                    expected: descr['#document'].join('\n'),
                    expectedErrors: descr['#errors'],
                    fragmentContext: fragmentContextTagName &&
                                     treeAdapter.createElement(fragmentContextTagName, HTML.NAMESPACES.HTML, [])
                });
            });
        });
    });

    return tests;
};

exports.serializeToTestDataFormat = function (rootNode, treeAdapter) {
    function getSerializedTreeIndent(indent) {
        var str = '|';

        for (var i = 0; i < indent + 1; i++)
            str += ' ';

        return str;
    }

    function getElementSerializedNamespaceURI(element) {
        switch (treeAdapter.getNamespaceURI(element)) {
            case HTML.NAMESPACES.SVG:
                return 'svg ';
            case HTML.NAMESPACES.MATHML:
                return 'math ';
            default :
                return '';
        }
    }

    function serializeNodeList(nodes, indent) {
        var str = '';

        nodes.forEach(function (node) {
            str += getSerializedTreeIndent(indent);

            if (treeAdapter.isCommentNode(node))
                str += '<!-- ' + treeAdapter.getCommentNodeContent(node) + ' -->\n';

            else if (treeAdapter.isTextNode(node))
                str += '"' + treeAdapter.getTextNodeContent(node) + '"\n';

            else if (treeAdapter.isDocumentTypeNode(node)) {
                var parts = [],
                    publicId = treeAdapter.getDocumentTypeNodePublicId(node),
                    systemId = treeAdapter.getDocumentTypeNodeSystemId(node);

                str += '<!DOCTYPE';

                parts.push(treeAdapter.getDocumentTypeNodeName(node) || '');

                if (publicId !== null || systemId !== null) {
                    parts.push('"' + (publicId || '') + '"');
                    parts.push('"' + (systemId || '') + '"');
                }

                parts.forEach(function (part) {
                    str += ' ' + part;
                });

                str += '>\n';
            }

            else {
                str += '<' + getElementSerializedNamespaceURI(node) + treeAdapter.getTagName(node) + '>\n';

                var childrenIndent = indent + 2,
                    serializedAttrs = [];

                treeAdapter.getAttrList(node).forEach(function (attr) {
                    var attrStr = getSerializedTreeIndent(childrenIndent);

                    if (attr.prefix)
                        attrStr += attr.prefix + ' ';

                    attrStr += attr.name + '="' + attr.value + '"\n';

                    serializedAttrs.push(attrStr);
                });

                str += serializedAttrs.sort().join('');
                str += serializeNodeList(treeAdapter.getChildNodes(node), childrenIndent);
            }
        });

        return str;
    }

    return serializeNodeList(treeAdapter.getChildNodes(rootNode), 0);
};

exports.prettyPrintParserAssertionArgs = function (actual, expected) {
    var msg = '\nExpected:\n';
    msg += '-----------------\n';
    msg += expected + '\n';
    msg += '\nActual:\n';
    msg += '-----------------\n';
    msg += actual + '\n';

    return msg;
};