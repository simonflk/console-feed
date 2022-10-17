'use strict'
exports.__esModule = true
// Const
var TRANSFORMED_TYPE_KEY = '@t'
var CIRCULAR_REF_KEY = '@r'
var KEY_REQUIRE_ESCAPING_RE = /^#*@(t|r)$/
var GLOBAL = (function getGlobal() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvVHJhbnNmb3JtL3JlcGxpY2F0b3IvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxRQUFRO0FBQ1IsSUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUE7QUFDakMsSUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUE7QUFDN0IsSUFBTSx1QkFBdUIsR0FBRyxZQUFZLENBQUE7QUFFNUMsSUFBTSxNQUFNLEdBQUcsQ0FBQyxTQUFTLFNBQVM7SUFDaEMsOEZBQThGO0lBQzlGLElBQU0sU0FBUyxHQUFHLElBQUksQ0FBQTtJQUV0QixPQUFPLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtBQUMxQixDQUFDLENBQUMsRUFBRSxDQUFBO0FBRUosSUFBTSxzQkFBc0IsR0FBRyxPQUFPLFdBQVcsS0FBSyxVQUFVLENBQUE7QUFDaEUsSUFBTSxhQUFhLEdBQUcsT0FBTyxHQUFHLEtBQUssVUFBVSxDQUFBO0FBQy9DLElBQU0sYUFBYSxHQUFHLE9BQU8sR0FBRyxLQUFLLFVBQVUsQ0FBQTtBQUUvQyxJQUFNLGlCQUFpQixHQUFHO0lBQ3hCLFdBQVc7SUFDWCxZQUFZO0lBQ1osbUJBQW1CO0lBQ25CLFlBQVk7SUFDWixhQUFhO0lBQ2IsWUFBWTtJQUNaLGFBQWE7SUFDYixjQUFjO0lBQ2QsY0FBYztDQUNmLENBQUE7QUFFRCx3QkFBd0I7QUFDeEIsSUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUE7QUFFdEMscUJBQXFCO0FBQ3JCLElBQU0sY0FBYyxHQUFHO0lBQ3JCLFNBQVMsRUFBVCxVQUFVLEdBQVE7UUFDaEIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQzVCLENBQUM7SUFFRCxXQUFXLEVBQVgsVUFBWSxHQUFRO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUN4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
