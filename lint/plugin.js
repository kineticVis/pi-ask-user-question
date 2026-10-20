function makeReporter({ context, messageId }) {
  return (node) => context.report({ node, messageId });
}

const FUNCTION_NODES =
  ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSFunctionType, TSMethodSignature)";

// array methods that change the receiver instead of returning a new array
const MUTATING_METHODS =
  "push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin";

// a TS `this: Foo` pseudo-parameter isn't a real argument
function isThisParam(param) {
  return param.type === "Identifier" && param.name === "this";
}

// `arr.map((item, index) => ...)`: the caller's API dictates the signature
function isCallbackArgument(node) {
  const { parent } = node;
  return (
    (parent?.type === "CallExpression" || parent?.type === "NewExpression") &&
    parent.arguments.includes(node)
  );
}

const plugin = {
  meta: { name: "local" },
  rules: {
    "no-inline-param-object-types": {
      meta: {
        type: "problem",
        messages: {
          inlineParamType:
            "Inline object-literal parameter types are not allowed; declare a named type alias.",
        },
        schema: [],
      },
      create(context) {
        const fire = makeReporter({ context, messageId: "inlineParamType" });

        return {
          [`${FUNCTION_NODES} > :matches(Identifier, ObjectPattern).params > TSTypeAnnotation > TSTypeLiteral`]:
            fire,
          // a defaulted parameter wraps the typed binding in an AssignmentPattern
          [`${FUNCTION_NODES} > AssignmentPattern.params > :matches(Identifier, ObjectPattern).left > TSTypeAnnotation > TSTypeLiteral`]:
            fire,
        };
      },
    },
    "no-array-mutation": {
      meta: {
        type: "problem",
        messages: {
          mutation:
            "`.{{method}}()` mutates in place; build a new array (spread, map, filter, toSorted, toReversed, toSpliced, with).",
        },
        schema: [],
      },
      create(context) {
        // no type info in JS plugins, so this matches by method name; a PascalCase receiver
        // (`Key.shift("tab")`) is a namespace or class, not an array
        return {
          [`CallExpression > MemberExpression.callee[computed=false]:not([object.name=/^[A-Z]/]) > Identifier.property[name=/^(${MUTATING_METHODS})$/]`](
            node,
          ) {
            context.report({
              node,
              messageId: "mutation",
              data: { method: node.name },
            });
          },
        };
      },
    },
    "single-object-param": {
      meta: {
        type: "suggestion",
        messages: {
          tooManyParams:
            "Function has {{count}} parameters; take a single object parameter with a named type instead.",
        },
        schema: [],
      },
      create(context) {
        return {
          [FUNCTION_NODES](node) {
            if (isCallbackArgument(node)) return;

            const params = node.params.filter((param) => !isThisParam(param));
            if (params.length <= 1) return;

            context.report({
              node: params[1],
              messageId: "tooManyParams",
              data: { count: String(params.length) },
            });
          },
        };
      },
    },
  },
};

export default plugin;
