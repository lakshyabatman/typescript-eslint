import { createRule } from '../util';
import {
  AST_NODE_TYPES,
  TSESTree,
} from '@typescript-eslint/experimental-utils';

type MessageIds = 'preferRecord' | 'preferIndexSignature';
type Options = ['record' | 'index-signature'];

export default createRule<Options, MessageIds>({
  name: 'consistent-indexed-object-style',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce or disallow the use of the record type',
      category: 'Stylistic Issues',
      // too opinionated to be recommended
      recommended: false,
    },
    messages: {
      preferRecord: 'A record is preferred over an index signature',
      preferIndexSignature: 'An index signature is preferred over a record.',
    },
    fixable: 'code',
    schema: [
      {
        enum: ['record', 'index-signature'],
      },
    ],
  },
  defaultOptions: ['record'],
  create(context) {
    const sourceCode = context.getSourceCode();

    if (context.options[0] === 'index-signature') {
      return {
        TSTypeReference(node): void {
          const typeName = node.typeName;
          if (typeName.type !== AST_NODE_TYPES.Identifier) {
            return;
          }
          if (typeName.name !== 'Record') {
            return;
          }

          const params = node.typeParameters?.params;
          if (params?.length !== 2) {
            return;
          }

          context.report({
            node,
            messageId: 'preferIndexSignature',
            fix(fixer) {
              const key = sourceCode.getText(params[0]);
              const type = sourceCode.getText(params[1]);
              return fixer.replaceText(node, `{ [key: ${key}]: ${type} }`);
            },
          });
        },
      };
    }

    function checkMembers(
      members: TSESTree.TypeElement[],
      node: TSESTree.Node,
      prefix: string,
      postfix: string,
    ): void {
      if (members.length !== 1) {
        return;
      }
      const [member] = members;

      if (member.type !== AST_NODE_TYPES.TSIndexSignature) {
        return;
      }

      const [parameter] = member.parameters;

      if (!parameter) {
        return;
      }

      if (parameter.type !== AST_NODE_TYPES.Identifier) {
        return;
      }
      const keyType = parameter.typeAnnotation;
      if (!keyType) {
        return;
      }

      const valueType = member.typeAnnotation;
      if (!valueType) {
        return;
      }

      const scope = context.getScope();
      if (
        scope.block.type == AST_NODE_TYPES.Program &&
        scope.block.body[0].type == AST_NODE_TYPES.TSTypeAliasDeclaration
      ) {
        const body = scope.block.body[0];
        const name = body?.id.name;
        const memberTypes = member.typeAnnotation?.typeAnnotation;
        if (memberTypes) {
          if (
            memberTypes.type == AST_NODE_TYPES.TSTypeReference &&
            memberTypes.typeName.type == AST_NODE_TYPES.Identifier &&
            memberTypes.typeName.name == name
          ) {
            return;
          } else if (memberTypes.type == AST_NODE_TYPES.TSUnionType) {
            const membersArray = memberTypes.types;
            let flag = false;
            membersArray.forEach((m: TSESTree.Node) => {
              if (
                m.type == AST_NODE_TYPES.TSTypeReference &&
                m.typeName.type == AST_NODE_TYPES.Identifier &&
                m.typeName.name == name
              ) {
                flag = true;
              }
            });
            if (flag) {
              return;
            }
          }
        }
      }

      context.report({
        node,
        messageId: 'preferRecord',
        fix(fixer) {
          const value = sourceCode.getText(valueType.typeAnnotation);
          const key = sourceCode.getText(keyType.typeAnnotation);
          return fixer.replaceText(
            node,
            `${prefix}Record<${key}, ${value}>${postfix}`,
          );
        },
      });
    }

    return {
      TSTypeLiteral(node): void {
        checkMembers(node.members, node, '', '');
      },

      TSInterfaceDeclaration(node): void {
        let genericTypes = '';

        if ((node.typeParameters?.params ?? []).length > 0) {
          genericTypes = `<${node.typeParameters?.params
            .map(p => p.name.name)
            .join(', ')}>`;
        }

        checkMembers(
          node.body.body,
          node,
          `type ${node.id.name}${genericTypes} = `,
          ';',
        );
      },
    };
  },
});
