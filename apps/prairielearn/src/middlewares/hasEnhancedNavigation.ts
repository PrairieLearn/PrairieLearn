import expressAsyncHandler from 'express-async-handler';

import { features } from '../lib/features/index.js';

export default expressAsyncHandler(async (req, res, next) => {
  const hasEnhancedNavigation = await features.enabled('enhanced-navigation', {
    institution_id: req.params.institution_id,
  });
  res.locals.has_enhanced_navigation = hasEnhancedNavigation;
  next();
});
