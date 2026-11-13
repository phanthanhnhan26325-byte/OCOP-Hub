const reviewSchemaObjects = [
  'product_reviews',
  'workshop_reviews',
  'product_reviews_public',
  'workshop_reviews_public',
  'product_review_stats',
  'workshop_review_stats',
];

export function isMissingReviewSchema(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  const mentionsReviewSchema = reviewSchemaObjects.some((name) => message.includes(name));
  return error.code === 'PGRST205'
    || error.code === '42P01'
    || (mentionsReviewSchema && (
      message.includes('schema cache')
      || message.includes('does not exist')
      || message.includes('could not find the table')
    ));
}
