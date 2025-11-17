-- Create usage tracking table for monthly quotas
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  month_year TEXT NOT NULL, -- Format: 'YYYY-MM'
  request_count INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'paid', 'premium'
  quota_limit INTEGER NOT NULL DEFAULT 30, -- Free tier: 30/month
  last_request_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_year)
);

-- Enable RLS
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view own usage"
ON public.usage_tracking
FOR SELECT
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_usage_tracking_user_month ON public.usage_tracking(user_id, month_year);

-- Function to update usage count
CREATE OR REPLACE FUNCTION public.increment_usage_count(
  p_user_id UUID,
  p_tier TEXT DEFAULT 'free'
)
RETURNS TABLE(
  current_count INTEGER,
  quota_limit INTEGER,
  remaining INTEGER,
  is_within_quota BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_year TEXT;
  v_quota INTEGER;
  v_count INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Get current month-year
  v_month_year := to_char(now(), 'YYYY-MM');
  
  -- Set quota based on tier
  v_quota := CASE p_tier
    WHEN 'free' THEN 30
    WHEN 'paid' THEN 2000
    WHEN 'premium' THEN 5000
    ELSE 30
  END;
  
  -- Insert or update usage record
  INSERT INTO public.usage_tracking (user_id, month_year, request_count, tier, quota_limit)
  VALUES (p_user_id, v_month_year, 1, p_tier, v_quota)
  ON CONFLICT (user_id, month_year)
  DO UPDATE SET
    request_count = usage_tracking.request_count + 1,
    last_request_at = now(),
    updated_at = now(),
    tier = EXCLUDED.tier,
    quota_limit = EXCLUDED.quota_limit
  RETURNING usage_tracking.request_count, usage_tracking.quota_limit INTO v_count, v_quota;
  
  v_remaining := v_quota - v_count;
  
  RETURN QUERY SELECT 
    v_count,
    v_quota,
    v_remaining,
    v_count <= v_quota;
END;
$$;

-- Function to check usage without incrementing
CREATE OR REPLACE FUNCTION public.check_usage_quota(
  p_user_id UUID,
  p_tier TEXT DEFAULT 'free'
)
RETURNS TABLE(
  current_count INTEGER,
  quota_limit INTEGER,
  remaining INTEGER,
  is_within_quota BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_year TEXT;
  v_quota INTEGER;
  v_count INTEGER;
  v_remaining INTEGER;
BEGIN
  v_month_year := to_char(now(), 'YYYY-MM');
  
  v_quota := CASE p_tier
    WHEN 'free' THEN 30
    WHEN 'paid' THEN 2000
    WHEN 'premium' THEN 5000
    ELSE 30
  END;
  
  SELECT COALESCE(request_count, 0) INTO v_count
  FROM public.usage_tracking
  WHERE user_id = p_user_id AND month_year = v_month_year;
  
  IF v_count IS NULL THEN
    v_count := 0;
  END IF;
  
  v_remaining := v_quota - v_count;
  
  RETURN QUERY SELECT 
    v_count,
    v_quota,
    v_remaining,
    v_count < v_quota;
END;
$$;