'use strict'
exports.__esModule = true
// Const
var TRANSFORMED_TYPE_KEY = '@t'
var CIRCULAR_REF_KEY = '@r'
var KEY_REQUIRE_ESCAPING_RE = /^#*@(t|r)$/
var GLOBAL = (function getGlobal() {
  if (typeof globalThis !== 'undefined') {
    return globalThis
  }
  // NOTE: see http://www.ecma-international.org/ecma-262/6.0/index.html#sec-performeval step 10
  var savedEval = eval
  return savedEval('this')
})()
var ARRAY_BUFFER_SUPPORTED = typeof ArrayBuffer === 'function'
var MAP_SUPPORTED = typeof Map === 'function'
var SET_SUPPORTED = typeof Set === 'function'
var TYPED_ARRAY_CTORS = [
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
]
// Saved proto functions
var arrSlice = Array.prototype.slice
// Default serializer
var JSONSerializer = {
  serialize: function (val) {
    return JSON.stringify(val)
  },
  deserialize: function (val) {
    return JSON.parse(val)
  },
}
// EncodingTransformer
var EncodingTransformer = /** @class */ (function () {
  function EncodingTransformer(val, transforms) {
    this.references = val
    this.transforms = transforms
    this.transformsMap = this._makeTransformsMap()
    this.circularCandidates = []
    this.circularCandidatesDescrs = []
    this.circularRefCount = 0
  }
  EncodingTransformer._createRefMark = function (idx) {
    var obj = Object.create(null)
    obj[CIRCULAR_REF_KEY] = idx
    return obj
  }
  EncodingTransformer.prototype._createCircularCandidate = function (
    val,
    parent,
    key
  ) {
    this.circularCandidates.push(val)
    this.circularCandidatesDescrs.push({ parent: parent, key: key, refIdx: -1 })
  }
  EncodingTransformer.prototype._applyTransform = function (
    val,
    parent,
    key,
    transform
  ) {
    var result = Object.create(null)
    var serializableVal = transform.toSerializable(val)
    if (typeof serializableVal === 'object')
      this._createCircularCandidate(val, parent, key)
    result[TRANSFORMED_TYPE_KEY] = transform.type
    result.data = this._handleValue(
      function () {
        return serializableVal
      },
      parent,
      key
    )
    return result
  }
  EncodingTransformer.prototype._handleArray = function (arr) {
    var result = []
    var _loop_1 = function (i) {
      result[i] = this_1._handleValue(
        function () {
          return arr[i]
        },
        result,
        i
      )
    }
    var this_1 = this
    for (var i = 0; i < arr.length; i++) {
      _loop_1(i)
    }
    return result
  }
  EncodingTransformer.prototype._handlePlainObject = function (obj) {
    var _a, _b
    var result = Object.create(null)
    var _loop_2 = function (key) {
      if (Reflect.has(obj, key)) {
        var resultKey = KEY_REQUIRE_ESCAPING_RE.test(key) ? '#' + key : key
        result[resultKey] = this_2._handleValue(
          function () {
            return obj[key]
          },
          result,
          resultKey
        )
      }
    }
    var this_2 = this
    for (var key in obj) {
      _loop_2(key)
    }
    var name =
      (_b =
        (_a = obj === null || obj === void 0 ? void 0 : obj.__proto__) ===
          null || _a === void 0
          ? void 0
          : _a.constructor) === null || _b === void 0
        ? void 0
        : _b.name
    if (name && name !== 'Object') {
      result.constructor = { name: name }
    }
    return result
  }
  EncodingTransformer.prototype._handleObject = function (obj, parent, key) {
    this._createCircularCandidate(obj, parent, key)
    return Array.isArray(obj)
      ? this._handleArray(obj)
      : this._handlePlainObject(obj)
  }
  EncodingTransformer.prototype._ensureCircularReference = function (obj) {
    var circularCandidateIdx = this.circularCandidates.indexOf(obj)
    if (circularCandidateIdx > -1) {
      var descr = this.circularCandidatesDescrs[circularCandidateIdx]
      if (descr.refIdx === -1)
        descr.refIdx = descr.parent ? ++this.circularRefCount : 0
      return EncodingTransformer._createRefMark(descr.refIdx)
    }
    return null
  }
  EncodingTransformer.prototype._handleValue = function (getVal, parent, key) {
    try {
      var val = getVal()
      var type = typeof val
      var isObject = type === 'object' && val !== null
      if (isObject) {
        var refMark = this._ensureCircularReference(val)
        if (refMark) return refMark
      }
      var transform = this._findTransform(type, val)
      if (transform) {
        return this._applyTransform(val, parent, key, transform)
      }
      if (isObject) return this._handleObject(val, parent, key)
      return val
    } catch (e) {
      try {
        return this._handleValue(
          function () {
            return e instanceof Error ? e : new Error(e)
          },
          parent,
          key
        )
      } catch (_a) {
        return null
      }
    }
  }
  EncodingTransformer.prototype._makeTransformsMap = function () {
    if (!MAP_SUPPORTED) {
      return
    }
    var map = new Map()
    this.transforms.forEach(function (transform) {
      if (transform.lookup) {
        map.set(transform.lookup, transform)
      }
    })
    return map
  }
  EncodingTransformer.prototype._findTransform = function (type, val) {
    if (MAP_SUPPORTED) {
      if (val && val.constructor) {
        var transform = this.transformsMap.get(val.constructor)
        if (
          transform === null || transform === void 0
            ? void 0
            : transform.shouldTransform(type, val)
        )
          return transform
      }
    }
    for (var _i = 0, _a = this.transforms; _i < _a.length; _i++) {
      var transform = _a[_i]
      if (transform.shouldTransform(type, val)) return transform
    }
  }
  EncodingTransformer.prototype.transform = function () {
    var _this = this
    var references = [
      this._handleValue(
        function () {
          return _this.references
        },
        null,
        null
      ),
    ]
    for (var _i = 0, _a = this.circularCandidatesDescrs; _i < _a.length; _i++) {
      var descr = _a[_i]
      if (descr.refIdx > 0) {
        references[descr.refIdx] = descr.parent[descr.key]
        descr.parent[descr.key] = EncodingTransformer._createRefMark(
          descr.refIdx
        )
      }
    }
    return references
  }
  return EncodingTransformer
})()
// DecodingTransform
var DecodingTransformer = /** @class */ (function () {
  function DecodingTransformer(references, transformsMap) {
    this.activeTransformsStack = []
    this.visitedRefs = Object.create(null)
    this.references = references
    this.transformMap = transformsMap
  }
  DecodingTransformer.prototype._handlePlainObject = function (obj) {
    var unescaped = Object.create(null)
    if ('constructor' in obj) {
      if (!obj.constructor || typeof obj.constructor.name !== 'string') {
        obj.constructor = {
          name: 'Object',
        }
      }
    }
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        this._handleValue(obj[key], obj, key)
        if (KEY_REQUIRE_ESCAPING_RE.test(key)) {
          // NOTE: use intermediate object to avoid unescaped and escaped keys interference
          // E.g. unescaped "##@t" will be "#@t" which can overwrite escaped "#@t".
          unescaped[key.substring(1)] = obj[key]
          delete obj[key]
        }
      }
    }
    for (var unsecapedKey in unescaped)
      obj[unsecapedKey] = unescaped[unsecapedKey]
  }
  DecodingTransformer.prototype._handleTransformedObject = function (
    obj,
    parent,
    key
  ) {
    var transformType = obj[TRANSFORMED_TYPE_KEY]
    var transform = this.transformMap[transformType]
    if (!transform)
      throw new Error('Can\'t find transform for "' + transformType + '" type.')
    this.activeTransformsStack.push(obj)
    this._handleValue(obj.data, obj, 'data')
    this.activeTransformsStack.pop()
    parent[key] = transform.fromSerializable(obj.data)
  }
  DecodingTransformer.prototype._handleCircularSelfRefDuringTransform = function (
    refIdx,
    parent,
    key
  ) {
    // NOTE: we've hit a hard case: object reference itself during transformation.
    // We can't dereference it since we don't have resulting object yet. And we'll
    // not be able to restore reference lately because we will need to traverse
    // transformed object again and reference might be unreachable or new object contain
    // new circular references. As a workaround we create getter, so once transformation
    // complete, dereferenced property will point to correct transformed object.
    var references = this.references
    Object.defineProperty(parent, key, {
      // @ts-ignore
      val: void 0,
      configurable: true,
      enumerable: true,
      get: function () {
        if (this.val === void 0) this.val = references[refIdx]
        return this.val
      },
      set: function (value) {
        this.val = value
      },
    })
  }
  DecodingTransformer.prototype._handleCircularRef = function (
    refIdx,
    parent,
    key
  ) {
    if (this.activeTransformsStack.includes(this.references[refIdx]))
      this._handleCircularSelfRefDuringTransform(refIdx, parent, key)
    else {
      if (!this.visitedRefs[refIdx]) {
        this.visitedRefs[refIdx] = true
        this._handleValue(this.references[refIdx], this.references, refIdx)
      }
      parent[key] = this.references[refIdx]
    }
  }
  DecodingTransformer.prototype._handleValue = function (val, parent, key) {
    if (typeof val !== 'object' || val === null) return
    var refIdx = val[CIRCULAR_REF_KEY]
    if (refIdx !== void 0) this._handleCircularRef(refIdx, parent, key)
    else if (val[TRANSFORMED_TYPE_KEY])
      this._handleTransformedObject(val, parent, key)
    else if (Array.isArray(val)) {
      for (var i = 0; i < val.length; i++) this._handleValue(val[i], val, i)
    } else this._handlePlainObject(val)
  }
  DecodingTransformer.prototype.transform = function () {
    this.visitedRefs[0] = true
    this._handleValue(this.references[0], this.references, 0)
    return this.references[0]
  }
  return DecodingTransformer
})()
// Transforms
var builtInTransforms = [
  {
    type: '[[NaN]]',
    shouldTransform: function (type, val) {
      return type === 'number' && isNaN(val)
    },
    toSerializable: function () {
      return ''
    },
    fromSerializable: function () {
      return NaN
    },
  },
  {
    type: '[[undefined]]',
    shouldTransform: function (type) {
      return type === 'undefined'
    },
    toSerializable: function () {
      return ''
    },
    fromSerializable: function () {
      return void 0
    },
  },
  {
    type: '[[Date]]',
    lookup: Date,
    shouldTransform: function (type, val) {
      return val instanceof Date
    },
    toSerializable: function (date) {
      return date.getTime()
    },
    fromSerializable: function (val) {
      var date = new Date()
      date.setTime(val)
      return date
    },
  },
  {
    type: '[[RegExp]]',
    lookup: RegExp,
    shouldTransform: function (type, val) {
      return val instanceof RegExp
    },
    toSerializable: function (re) {
      var result = {
        src: re.source,
        flags: '',
      }
      if (re.global) result.flags += 'g'
      if (re.ignoreCase) result.flags += 'i'
      if (re.multiline) result.flags += 'm'
      return result
    },
    fromSerializable: function (val) {
      return new RegExp(val.src, val.flags)
    },
  },
  {
    type: '[[Error]]',
    lookup: Error,
    shouldTransform: function (type, val) {
      return val instanceof Error
    },
    toSerializable: function (err) {
      var _a, _b
      if (!err.stack) {
        ;(_b = (_a = Error).captureStackTrace) === null || _b === void 0
          ? void 0
          : _b.call(_a, err)
      }
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
    },
    fromSerializable: function (val) {
      var Ctor = GLOBAL[val.name] || Error
      var err = new Ctor(val.message)
      err.stack = val.stack
      return err
    },
  },
  {
    type: '[[ArrayBuffer]]',
    lookup: ARRAY_BUFFER_SUPPORTED && ArrayBuffer,
    shouldTransform: function (type, val) {
      return ARRAY_BUFFER_SUPPORTED && val instanceof ArrayBuffer
    },
    toSerializable: function (buffer) {
      var view = new Int8Array(buffer)
      return arrSlice.call(view)
    },
    fromSerializable: function (val) {
      if (ARRAY_BUFFER_SUPPORTED) {
        var buffer = new ArrayBuffer(val.length)
        var view = new Int8Array(buffer)
        view.set(val)
        return buffer
      }
      return val
    },
  },
  {
    type: '[[TypedArray]]',
    shouldTransform: function (type, val) {
      if (ARRAY_BUFFER_SUPPORTED) {
        return ArrayBuffer.isView(val) && !(val instanceof DataView)
      }
      for (
        var _i = 0, TYPED_ARRAY_CTORS_1 = TYPED_ARRAY_CTORS;
        _i < TYPED_ARRAY_CTORS_1.length;
        _i++
      ) {
        var ctorName = TYPED_ARRAY_CTORS_1[_i]
        if (
          typeof GLOBAL[ctorName] === 'function' &&
          val instanceof GLOBAL[ctorName]
        )
          return true
      }
      return false
    },
    toSerializable: function (arr) {
      return {
        ctorName: arr.constructor.name,
        arr: arrSlice.call(arr),
      }
    },
    fromSerializable: function (val) {
      return typeof GLOBAL[val.ctorName] === 'function'
        ? new GLOBAL[val.ctorName](val.arr)
        : val.arr
    },
  },
  {
    type: '[[Map]]',
    lookup: MAP_SUPPORTED && Map,
    shouldTransform: function (type, val) {
      return MAP_SUPPORTED && val instanceof Map
    },
    toSerializable: function (map) {
      var flattenedKVArr = []
      map.forEach(function (val, key) {
        flattenedKVArr.push(key)
        flattenedKVArr.push(val)
      })
      return flattenedKVArr
    },
    fromSerializable: function (val) {
      if (MAP_SUPPORTED) {
        // NOTE: new Map(iterable) is not supported by all browsers
        var map = new Map()
        for (var i = 0; i < val.length; i += 2) map.set(val[i], val[i + 1])
        return map
      }
      var kvArr = []
      // @ts-ignore
      for (var j = 0; j < val.length; j += 2) kvArr.push([val[i], val[i + 1]])
      return kvArr
    },
  },
  {
    type: '[[Set]]',
    lookup: SET_SUPPORTED && Set,
    shouldTransform: function (type, val) {
      return SET_SUPPORTED && val instanceof Set
    },
    toSerializable: function (set) {
      var arr = []
      set.forEach(function (val) {
        arr.push(val)
      })
      return arr
    },
    fromSerializable: function (val) {
      if (SET_SUPPORTED) {
        // NOTE: new Set(iterable) is not supported by all browsers
        var set = new Set()
        for (var i = 0; i < val.length; i++) set.add(val[i])
        return set
      }
      return val
    },
  },
]
// Replicator
var Replicator = /** @class */ (function () {
  function Replicator(serializer) {
    this.transforms = []
    this.transformsMap = Object.create(null)
    this.serializer = serializer || JSONSerializer
    this.addTransforms(builtInTransforms)
  }
  Replicator.prototype.addTransforms = function (transforms) {
    transforms = Array.isArray(transforms) ? transforms : [transforms]
    for (
      var _i = 0, transforms_1 = transforms;
      _i < transforms_1.length;
      _i++
    ) {
      var transform = transforms_1[_i]
      if (this.transformsMap[transform.type])
        throw new Error(
          'Transform with type "' + transform.type + '" was already added.'
        )
      this.transforms.push(transform)
      this.transformsMap[transform.type] = transform
    }
    return this
  }
  Replicator.prototype.removeTransforms = function (transforms) {
    transforms = Array.isArray(transforms) ? transforms : [transforms]
    for (
      var _i = 0, transforms_2 = transforms;
      _i < transforms_2.length;
      _i++
    ) {
      var transform = transforms_2[_i]
      var idx = this.transforms.indexOf(transform)
      if (idx > -1) this.transforms.splice(idx, 1)
      delete this.transformsMap[transform.type]
    }
    return this
  }
  Replicator.prototype.encode = function (val) {
    var transformer = new EncodingTransformer(val, this.transforms)
    var references = transformer.transform()
    return this.serializer.serialize(references)
  }
  Replicator.prototype.decode = function (val) {
    var references = this.serializer.deserialize(val)
    var transformer = new DecodingTransformer(references, this.transformsMap)
    return transformer.transform()
  }
  return Replicator
})()
exports['default'] = Replicator
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvVHJhbnNmb3JtL3JlcGxpY2F0b3IvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxRQUFRO0FBQ1IsSUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUE7QUFDakMsSUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUE7QUFDN0IsSUFBTSx1QkFBdUIsR0FBRyxZQUFZLENBQUE7QUFFNUMsSUFBTSxNQUFNLEdBQUcsQ0FBQyxTQUFTLFNBQVM7SUFDaEMsSUFBSSxPQUFPLFVBQVUsS0FBSyxXQUFXLEVBQUU7UUFDckMsT0FBTyxVQUFVLENBQUE7S0FDbEI7SUFFRCw4RkFBOEY7SUFDOUYsSUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFBO0lBRXRCLE9BQU8sU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFBO0FBQzFCLENBQUMsQ0FBQyxFQUFFLENBQUE7QUFFSixJQUFNLHNCQUFzQixHQUFHLE9BQU8sV0FBVyxLQUFLLFVBQVUsQ0FBQTtBQUNoRSxJQUFNLGFBQWEsR0FBRyxPQUFPLEdBQUcsS0FBSyxVQUFVLENBQUE7QUFDL0MsSUFBTSxhQUFhLEdBQUcsT0FBTyxHQUFHLEtBQUssVUFBVSxDQUFBO0FBRS9DLElBQU0saUJBQWlCLEdBQUc7SUFDeEIsV0FBVztJQUNYLFlBQVk7SUFDWixtQkFBbUI7SUFDbkIsWUFBWTtJQUNaLGFBQWE7SUFDYixZQUFZO0lBQ1osYUFBYTtJQUNiLGNBQWM7SUFDZCxjQUFjO0NBQ2YsQ0FBQTtBQUVELHdCQUF3QjtBQUN4QixJQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQTtBQUV0QyxxQkFBcUI7QUFDckIsSUFBTSxjQUFjLEdBQUc7SUFDckIsU0FBUyxFQUFULFVBQVUsR0FBUTtRQUNoQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDNUIsQ0FBQztJQUVELFdBQVcsRUFB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
