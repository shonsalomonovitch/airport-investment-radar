import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions passed to Claude on every request.
 * These mirror the five tools exposed by ToolsService.run().
 * The input_schema properties drive Claude's argument construction —
 * keep descriptions precise and IATA-code examples consistent.
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'rank_airports_by_region',
    description:
      'Ranks airports in a US region or state by investment potential score. ' +
      'Returns a sorted list with total scores, grades, and top score drivers. ' +
      'Use for regional screening questions.',
    input_schema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description:
            'Named region or ISO state code. ' +
            'Examples: "New England", "US-MA", "US-CA", "US-TX"',
        },
      },
      required: ['region'],
    },
  },
  {
    name: 'compare_airports',
    description:
      'Compares two airports side-by-side across all four scoring dimensions. ' +
      'Returns full score breakdowns and a dimension-level winner for each component. ' +
      'Use when the user asks which airport is a better investment or wants a head-to-head.',
    input_schema: {
      type: 'object',
      properties: {
        airportA: {
          type: 'string',
          description: 'IATA code of the first airport (e.g. "BOS")',
        },
        airportB: {
          type: 'string',
          description: 'IATA code of the second airport (e.g. "LAX")',
        },
      },
      required: ['airportA', 'airportB'],
    },
  },
  {
    name: 'analyze_airport',
    description:
      'Returns a complete investment profile and score breakdown for a single airport — ' +
      'includes metadata (name, city, state, runway data), FAA demand snapshot, ' +
      'route activity, and all four scoring components with key drivers. ' +
      'Use this first when the user asks about a specific airport.',
    input_schema: {
      type: 'object',
      properties: {
        airport: {
          type: 'string',
          description: 'IATA code (e.g. "BOS")',
        },
      },
      required: ['airport'],
    },
  },
  {
    name: 'calculate_long_haul_share',
    description:
      'Calculates the share of long-haul routes (≥ 3,000 km great-circle distance) ' +
      'departing from an airport. Returns per-route distance details and the overall ' +
      'long-haul share percentage. Use when the user asks about international exposure, ' +
      'route mix, or long-haul network strength.',
    input_schema: {
      type: 'object',
      properties: {
        airport: {
          type: 'string',
          description: 'IATA code (e.g. "ANC")',
        },
      },
      required: ['airport'],
    },
  },
  {
    name: 'estimate_unmet_demand',
    description:
      'Estimates unmet flight demand using a proxy score that combines FAA demand growth ' +
      '(ops + enplanements forecast to 2030), congestion pressure, and runway capacity ' +
      'constraints. Returns a 0–100 proxy score with interpretation. ' +
      'NOT an official FAA unmet demand determination. ' +
      'Use when the user asks about capacity gaps, expansion potential, or latent demand.',
    input_schema: {
      type: 'object',
      properties: {
        airport: {
          type: 'string',
          description: 'IATA code (e.g. "SFO")',
        },
      },
      required: ['airport'],
    },
  },
];
