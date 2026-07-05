update public.products
set description = case slug
  when 'sterile-vial-kit' then 'A research workflow kit for organizing vial handling, surface preparation, and labeling routines. Use it as a structured starting point for building a cleaner bench process around research supplies.'
  when 'amber-cold-storage' then 'A compact storage option for keeping research materials organized, labeled, and protected from excess light exposure. Designed for users who want their supplies and notes in one tidy place.'
  when 'micro-measure-set' then 'A measurement-focused set for research users who want clearer unit tracking, consistent documentation, and fewer workflow interruptions while preparing supply plans.'
  else description
end
where slug in ('sterile-vial-kit', 'amber-cold-storage', 'micro-measure-set')
and nullif(description, '') is null;
