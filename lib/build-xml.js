/**
 * @copyright Maichong Software Ltd. 2016 http://maichong.it
 * @date 2016-09-26
 * @author Liang <liang@maichong.it>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const co = require('co');
const babel = require(process.cwd() + '/node_modules/babel-core');
const util = require('./util');
const components = process.cwd() + '/src/components/';
const dist = process.cwd() + '/dist/inc/';
const npmroot = process.cwd() + '/dist/inc/npm/';
const node_modules = process.cwd() + '/node_modules/';
const querystring = require('querystring');
const xmldom = require('xmldom');
const DOMParser = xmldom.DOMParser;
const XMLSerializer = xmldom.XMLSerializer;
const cwd = process.cwd();
require('colors');

/**
 * 判断字符串中指定的位置是否是被包含在引号中
 * @param string
 * @param n
 * @returns {boolean}
 */
function inText(string, n) {
  let firstIndex = string.search(/"|'/);
  if (firstIndex == -1 || firstIndex > n) return false;
  let char = '';
  let last = '';
  for (let i = 0; i < n; i++) {
    let c = string[i];
    if (c === '"' || c === "'") {
      if (!char) {
        char = c;
      } else if (char === c && last !== '\\') {
        char = '';
      }
    }
    last = c;
  }
  return char !== '';
}

/**
 * 将带数据绑定的字符串替换
 * @param {string} str     原始字符串
 * @param {string} prefix  前缀
 * @param {object} ignores 忽略的字符串map
 * @returns {string}
 */
function replaceString(str, prefix, ignores) {
  return str.replace(/\{\{[^}]+\}\}/ig, function (matchs) {
    return matchs.replace(/[^\.\w'"]([a-z\_\$][\w\d\._\$]*)/ig, function (match, word, n) {
      let char = match[0];
      let w = word.match(/^\w+/)[0];
      if (ignores.hasOwnProperty(w) || inText(matchs, n)) return match;
      return char + prefix + '.' + word;
    });
  });
}

/**
 * 递归绑定XML中的节点
 * @param node
 * @param prefix
 * @param ignores
 */
function bind(node, prefix, ignores) {
  ignores = Object.assign({
    true: true,
    false: true,
    null: true,
    undefined: true
  }, ignores);
  let _prefix = prefix.replace(/\./g, '_');
  let classPrefix = prefix.replace(/\./g, '-');

  //处理节点属性
  let attributes = node.attributes;
  for (let i in attributes) {
    if (!/^\d+$/.test(i)) continue;
    let attr = attributes[i];

    //处理属性值
    if (attr.value.indexOf('{') > -1) {
      attr.value = replaceString(attr.value, prefix, ignores);
    }

    //绑定事件
    if (/^(bind|catch)\w+/.test(attr.name)) {
      attr.value = _prefix + '_' + attr.value;
    }

    //如果是循环标签,则在子标签中忽略循环索引和值变量
    if (attr.name == 'wx:for') {
      let index = node.getAttribute('wx:for-index') || 'index';
      let item = node.getAttribute('wx:for-item') || 'item';
      ignores[index] = true;
      ignores[item] = true;
    }

    if (attr.name == 'class') {
      attr.value = attr.value.split(' ').map(cls => `${cls} ${classPrefix}-${cls}`).join(' ');
    }
  }

  //如果节点为文本
  if (node.nodeName == '#text') {
    let data = node.data;
    if (data) {
      node.replaceData(0, data.length, replaceString(data, prefix, ignores));
    }
  }

  //递归处理子节点
  for (let i in node.childNodes) {
    if (!/^\d+$/.test(i)) continue;
    let n = node.childNodes[i];
    bind(n, prefix, ignores);
  }
}

function build(from, prefix) {
  let data = fs.readFileSync(from, 'utf8');

  let doc = new DOMParser().parseFromString(data);

  if (prefix) {
    bind(doc, prefix);
  }

  let componentElements = doc.getElementsByTagName('component');

  for (let i in componentElements) {
    if (!/^\d+$/.test(i))continue;
    let el = componentElements[i];
    let key = el.getAttribute('key');
    let name = el.getAttribute('name') || key;
    if (!key) throw new Error('Unknown component key in ' + from);
    let src;
    if (util.isDirectory(path.join(components, name))) {
      //在components目录中
      src = path.join(components, name, name + '.xml');
    } else if (util.isDirectory(path.join(node_modules, name))) {
      //在node_modules目录中
      src = path.join(node_modules, name, 'index.xml');
    } else {
      throw new Error(`Can not find components "${name}" in ` + from);
    }
    let p = '';
    if (prefix) {
      p = prefix + '.' + key;
    } else {
      p = key;
    }
    let node = build(src, p);
    el.parentNode.replaceChild(node, el);
  }
  return doc;
}

module.exports = function * buildXML(from, to, ignores) {
  console.log('build xml'.green, path.relative(cwd, from).blue, '->', path.relative(cwd, to).cyan);
  let element = build(from, '');
  mkdirp.sync(path.dirname(to));
  fs.writeFileSync(to, element.toString());
};
