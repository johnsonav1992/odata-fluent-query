import { QueryDescriptor } from '../models'
import { ComputeBuilder, ComputeExpression, ComputeNumber, ComputeString, ComputeBoolean, GetNextPropertyPathParams } from '../models/query-compute'
import { createQuery } from './create-query'

function getNextPropertyPath<TVal>(params: GetNextPropertyPathParams<TVal>) {
  const { propertyPath, value, operator, type } = params

  return `${propertyPath} ${operator} ${value === null 
    ? 'null' 
    : typeof value === type
      ? value 
      : value?.toString()}`
}

function computeBuilder(propertyPath: string): Record<string, (...args: any[]) => unknown> {
  return {
    as: <TAlias extends string>(alias: TAlias) => ({
      toString: () => `${propertyPath} as ${alias}`,
      _alias: alias,
      _type: undefined
    }),
    toString: () => propertyPath,
    substring: (start: number, length?: number) => {
      const args = length !== undefined ? `${start},${length}` : start.toString()

      return computeBuilder(`substring(${propertyPath},${args})`)
    },
    length: () => computeBuilder(`length(${propertyPath})`),
    concat: (...values: (string | ComputeString | ComputeExpression | null)[]) => {
      const args = values.map(v => {
        if (v === null) return 'null'
        if (typeof v === 'string') return `'${v}'`
        if (v && typeof v.toString === 'function') return v.toString()

        return v
      })
      
      // AVJ: below we have to handle the fact that OData concat
      // requires nested concat calls for multiple arguments
      // beyond just two. This will allow a user to pass many arguments
      // to `.concat` and the nesting will be done behind the scenes.
      if (args.length === 1) {
        return computeBuilder(`concat(${propertyPath},${args[0]})`)
      } else {
        let result = `concat(${propertyPath},${args[0]})`

        for (let i = 1; i < args.length; i++) {
          result = `concat(${result},${args[i]})`
        }

        return computeBuilder(result)
      }
    },
    and: (value: boolean | ComputeBoolean | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'and',
        type: 'boolean'
      })),
    or: (value: boolean | ComputeBoolean | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'or',
        type: 'boolean'
      })),
    not: () => computeBuilder(`not ${propertyPath}`),
    equals: (value: boolean | ComputeBoolean | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'eq',
        type: 'boolean'
      })),
    notEquals: (value: boolean | ComputeBoolean | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'ne',
        type: 'boolean'
      })),
    multiply: (value: number | ComputeNumber | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'mul',
        type: 'number'
      })),
    divide: (value: number | ComputeNumber | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'div',
        type: 'number'
      })),
    add: (value: number | ComputeNumber | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'add',
        type: 'number'
      }))
    ,
    subtract: (value: number | ComputeNumber | ComputeExpression | null) => 
      computeBuilder(getNextPropertyPath({
        propertyPath,
        value,
        operator: 'sub',
        type: 'number'
      })),
    year: () => computeBuilder(`year(${propertyPath})`),
    month: () => computeBuilder(`month(${propertyPath})`),
    day: () => computeBuilder(`day(${propertyPath})`),
    hour: () => computeBuilder(`hour(${propertyPath})`),
    minute: () => computeBuilder(`minute(${propertyPath})`),
    second: () => computeBuilder(`second(${propertyPath})`),
    date: () => computeBuilder(`date(${propertyPath})`),
    time: () => computeBuilder(`time(${propertyPath})`)
  }
}

function makeCompute<T>(): ComputeBuilder<T> {
  return new Proxy({} as ComputeBuilder<T>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      
      return computeBuilder(prop)
    }
  })
}

export function createCompute<T>(descriptor: QueryDescriptor) {
  return (
    exp: (builder: ComputeBuilder<T>) => ComputeExpression
  ) => {
    const builder = makeCompute<T>()
    const expression = exp(builder)
    
    const newDescriptor = {
      ...descriptor,
      compute: [...descriptor.compute, expression.toString()]
    }
    
    return createQuery(newDescriptor)
  }
}

